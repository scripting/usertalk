/*  Evaluate a UserTalk AST from parse.js. Semantics from the kernel's
	langevaluate.c: an object-database tree is the global namespace,
	locals live in frames, handlers close over their defining frames,
	identifier lookup is case-insensitive everywhere.
	
	by CC, 7/27/26 */

function makeEnvironment (theOdb, theVerbs, theTrace) {
	
	const environment = {
		odb: theOdb, //a plain object tree standing in for the ODB
		verbs: theVerbs, //lowercase dotted verb name -> function (args, environment)
		trace: theTrace, //every verb call gets logged here
		frames: [], //the local-variable stack; each frame is {vars: {}}
		withPaths: [] //active with-statement prefixes, innermost last
		};
	installConstants (theOdb);
	return (environment);
	}

const languageConstants = { //type names match what the typeof verb returns, so case statements compare true
	nil: undefined, "this": undefined,
	tabletype: "tabletype", outlinetype: "outlinetype", scripttype: "scripttype",
	wptexttype: "wptexttype", binarytype: "binarytype", stringtype: "stringtype",
	booleantype: "booleantype", datetype: "datetype", numbertype: "numbertype",
	longtype: "numbertype", inttype: "numbertype", doubletype: "numbertype",
	listtype: "listtype", recordtype: "recordtype", addresstype: "addresstype",
	unknowntype: "unknowntype",
	up: "up", down: "down", left: "left", right: "right",
	flatup: "flatup", flatdown: "flatdown",
	pageup: "pageup", pagedown: "pagedown", firstlist: "firstlist", lastlist: "lastlist"
	};

function installConstants (theOdb) {
	Object.keys (languageConstants).forEach (function (name) {
		if (findKey (theOdb, name) === undefined) {
			theOdb [name] = languageConstants [name];
			}
		});
	}

function findKey (theTable, theName) { //case-insensitive key lookup, returns the real key or undefined
	if (theTable [theName] !== undefined) {
		return (theName);
		}
	const lower = theName.toLowerCase ();
	var found;
	Object.keys (theTable).forEach (function (key) {
		if ((found === undefined) && (key.toLowerCase () === lower)) {
			found = key;
			}
		});
	return (found);
	}

//control-flow signals travel as exceptions

function BreakSignal () {
	this.flBreakSignal = true;
	}

function ContinueSignal () {
	this.flContinueSignal = true;
	}

function ReturnSignal (theValue) {
	this.flReturnSignal = true;
	this.value = theValue;
	}

function evaluate (theStatements, environment) {
	
	/*  Run a statement list. Returns the value of the last expression
		statement, the way Frontier scripts return their last value.  */
	
	var lastValue;
	
	//references: a {get, set} pair for anything assignable
	
	function referenceForId (theName) {
		
		var ixFrame;
		for (ixFrame = environment.frames.length - 1; ixFrame >= 0; ixFrame--) {
			const vars = environment.frames [ixFrame].vars;
			const key = findKey (vars, theName);
			if (key !== undefined) {
				return ({
					get: function () {
						return (vars [key]);
						},
					set: function (theValue) {
						vars [key] = theValue;
						}
					});
				}
			}
		
		var ixWith;
		for (ixWith = environment.withPaths.length - 1; ixWith >= 0; ixWith--) {
			const withTable = environment.withPaths [ixWith];
			const key = findKey (withTable, theName);
			if (key !== undefined) {
				return ({
					get: function () {
						return (withTable [key]);
						},
					set: function (theValue) {
						withTable [key] = theValue;
						}
					});
				}
			}
		
		const odbKey = findKey (environment.odb, theName);
		if (odbKey !== undefined) {
			return ({
				get: function () {
					return (environment.odb [odbKey]);
					},
				set: function (theValue) {
					environment.odb [odbKey] = theValue;
					}
				});
			}
		
		return (undefined);
		}
	
	function referenceForNode (theNode) {
		
		switch (theNode.op) {
			
			case "id": {
				const existing = referenceForId (theNode.name);
				if (existing !== undefined) {
					return (existing);
					}
				//an unknown name assigns into the odb root, the way Frontier creates entries
				return ({
					get: function () {
						const message = "Can't get the value of " + theNode.name + " because there is no object with that name.";
						throw new Error (message);
						},
					set: function (theValue) {
						environment.odb [theNode.name] = theValue;
						}
					});
				}
			
			case "computedid": {
				const name = evalExpr (theNode.expr);
				return (referenceForNode ({op: "id", name: String (name)}));
				}
			
			case "dot": {
				const container = evalExpr (theNode.left);
				if ((container === undefined) || (container === null) || (typeof container !== "object")) {
					const message = "Can't access " + theNode.name + " because the value before the dot isn't a table.";
					throw new Error (message);
					}
				var key = findKey (container, theNode.name);
				if (key === undefined) {
					key = theNode.name;
					}
				const keyFinal = key;
				return ({
					get: function () {
						return (container [keyFinal]);
						},
					set: function (theValue) {
						container [keyFinal] = theValue;
						}
					});
				}
			
			case "index": {
				const container = evalExpr (theNode.left);
				const index = evalExpr (theNode.index);
				if (Array.isArray (container)) {
					return ({
						get: function () {
							return (container [index - 1]); //Frontier lists are 1-based
							},
						set: function (theValue) {
							container [index - 1] = theValue;
							}
						});
					}
				if ((container !== undefined) && (typeof container === "object")) {
					if (typeof index === "number") { //numeric index into a table: nth entry
						const keys = Object.keys (container);
						const keyAt = keys [index - 1];
						return ({
							get: function () {
								return (container [keyAt]);
								},
							set: function (theValue) {
								container [keyAt] = theValue;
								}
							});
						}
					var key = findKey (container, String (index));
					if (key === undefined) {
						key = String (index);
						}
					const keyFinal = key;
					return ({
						get: function () {
							return (container [keyFinal]);
							},
						set: function (theValue) {
							container [keyFinal] = theValue;
							}
						});
					}
				const message = "Can't subscript the value because it isn't a list or a table.";
				throw new Error (message);
				}
			
			case "deref": {
				const address = evalExpr (theNode.expr);
				return (referenceForAddress (address));
				}
			
			default: {
				const message = "Can't assign into a " + theNode.op + " expression.";
				throw new Error (message);
				}
			}
		}
	
	function referenceForAddress (theAddress) {
		if ((theAddress === undefined) || (theAddress.flAddress !== true)) {
			const message = "Can't dereference the value because it isn't an address.";
			throw new Error (message);
			}
		return (theAddress.reference);
		}
	
	//expressions
	
	function coerceForCompare (left, right) {
		if ((typeof left === "string") && (typeof right === "string")) { //Frontier string comparison is case-insensitive
			return ({left: left.toLowerCase (), right: right.toLowerCase ()});
			}
		return ({left, right});
		}
	
	function evalExpr (theNode) {
		
		switch (theNode.op) {
			
			case "const":
				return (theNode.value);
			
			case "list": {
				const items = [];
				theNode.items.forEach (function (item) {
					items.push (evalExpr (item));
					});
				return (items);
				}
			
			case "id": {
				const reference = referenceForId (theNode.name);
				if (reference === undefined) {
					const verb = environment.verbs [theNode.name.toLowerCase ()];
					if (verb !== undefined) {
						return (verb);
						}
					const message = "Can't get the value of " + theNode.name + " because there is no object with that name.";
					throw new Error (message);
					}
				return (reference.get ());
				}
			
			case "computedid":
				return (referenceForNode (theNode).get ());
			
			case "dot": {
				//try a verb first: file.copy is a verb, not a table walk
				const dottedName = dottedNameForNode (theNode);
				if (dottedName !== undefined) {
					const verb = environment.verbs [dottedName.toLowerCase ()];
					if (verb !== undefined) {
						return (verb);
						}
					}
				return (referenceForNode (theNode).get ());
				}
			
			case "index":
				return (referenceForNode (theNode).get ());
			
			case "address": {
				const reference = referenceForNode (theNode.expr);
				return ({flAddress: true, reference, pathText: pathTextForNode (theNode.expr)});
				}
			
			case "deref":
				return (referenceForAddress (evalExpr (theNode.expr)).get ());
			
			case "call":
				return (evalCall (theNode));
			
			case "not":
				return (!flTrue (evalExpr (theNode.expr)));
			
			case "negate":
				return (-evalExpr (theNode.expr));
			
			case "preincrement": case "postincrement": {
				const reference = referenceForNode (theNode.expr);
				const oldValue = reference.get ();
				reference.set (oldValue + 1);
				return (theNode.op === "preincrement" ? oldValue + 1 : oldValue);
				}
			
			case "predecrement": case "postdecrement": {
				const reference = referenceForNode (theNode.expr);
				const oldValue = reference.get ();
				reference.set (oldValue - 1);
				return (theNode.op === "predecrement" ? oldValue - 1 : oldValue);
				}
			
			case "and":
				return (flTrue (evalExpr (theNode.left)) && flTrue (evalExpr (theNode.right)));
			
			case "or":
				return (flTrue (evalExpr (theNode.left)) || flTrue (evalExpr (theNode.right)));
			
			case "add":
				return (evalExpr (theNode.left) + evalExpr (theNode.right));
			
			case "subtract": {
				const left = evalExpr (theNode.left), right = evalExpr (theNode.right);
				if ((typeof left === "string") || (typeof right === "string")) { //Frontier: "abc:" - ":" strips the suffix
					const leftString = String (left), rightString = String (right);
					if (leftString.endsWith (rightString)) {
						return (leftString.slice (0, leftString.length - rightString.length));
						}
					return (leftString);
					}
				return (left - right);
				}
			
			case "multiply":
				return (evalExpr (theNode.left) * evalExpr (theNode.right));
			
			case "divide":
				return (evalExpr (theNode.left) / evalExpr (theNode.right));
			
			case "mod":
				return (evalExpr (theNode.left) % evalExpr (theNode.right));
			
			case "eq": {
				const pair = coerceForCompare (evalExpr (theNode.left), evalExpr (theNode.right));
				return (pair.left == pair.right); //loose on purpose: Frontier coerces across types
				}
			
			case "ne": {
				const pair = coerceForCompare (evalExpr (theNode.left), evalExpr (theNode.right));
				return (pair.left != pair.right);
				}
			
			case "lt": {
				const pair = coerceForCompare (evalExpr (theNode.left), evalExpr (theNode.right));
				return (pair.left < pair.right);
				}
			
			case "gt": {
				const pair = coerceForCompare (evalExpr (theNode.left), evalExpr (theNode.right));
				return (pair.left > pair.right);
				}
			
			case "le": {
				const pair = coerceForCompare (evalExpr (theNode.left), evalExpr (theNode.right));
				return (pair.left <= pair.right);
				}
			
			case "ge": {
				const pair = coerceForCompare (evalExpr (theNode.left), evalExpr (theNode.right));
				return (pair.left >= pair.right);
				}
			
			case "beginswith": {
				const pair = coerceForCompare (String (evalExpr (theNode.left)), String (evalExpr (theNode.right)));
				return (pair.left.startsWith (pair.right));
				}
			
			case "endswith": {
				const pair = coerceForCompare (String (evalExpr (theNode.left)), String (evalExpr (theNode.right)));
				return (pair.left.endsWith (pair.right));
				}
			
			case "contains": {
				const pair = coerceForCompare (String (evalExpr (theNode.left)), String (evalExpr (theNode.right)));
				return (pair.left.indexOf (pair.right) !== -1);
				}
			
			case "namedarg":
				return (evalExpr (theNode.value));
			
			default: {
				const message = "Can't evaluate the expression because the operator " + theNode.op + " isn't implemented.";
				throw new Error (message);
				}
			}
		}
	
	function flTrue (theValue) {
		return ((theValue !== false) && (theValue !== undefined) && (theValue !== 0) && (theValue !== ""));
		}
	
	function dottedNameForNode (theNode) { //x.y.z as a string, or undefined if it isn't a plain path
		if (theNode.op === "id") {
			return (theNode.name);
			}
		if (theNode.op === "dot") {
			const left = dottedNameForNode (theNode.left);
			if (left === undefined) {
				return (undefined);
				}
			return (left + "." + theNode.name);
			}
		return (undefined);
		}
	
	function pathTextForNode (theNode) {
		const dotted = dottedNameForNode (theNode);
		if (dotted !== undefined) {
			return (dotted);
			}
		return ("(computed)");
		}
	
	function evalCall (theNode) {
		
		const args = [];
		theNode.args.forEach (function (argNode) {
			args.push (evalExpr (argNode));
			});
		
		//a handler defined in scope?
		
		const dottedName = dottedNameForNode (theNode.fn);
		
		if (theNode.fn.op === "id") {
			const reference = referenceForId (theNode.fn.name);
			if (reference !== undefined) {
				const value = reference.get ();
				if ((value !== undefined) && (value.flHandler === true)) {
					return (callHandler (value, args));
					}
				}
			}
		
		if (dottedName !== undefined) {
			const verb = environment.verbs [dottedName.toLowerCase ()];
			if (verb !== undefined) {
				environment.trace.push ({verb: dottedName, args});
				return (verb (args, environment));
				}
			//a dotted path may name a handler, or a script stored in the odb tree
			try {
				const value = referenceForNode (theNode.fn).get ();
				if ((value !== undefined) && (value.flHandler === true)) {
					return (callHandler (value, args));
					}
				if ((value !== undefined) && (value.flOdbScript === true)) {
					environment.trace.push ({verb: dottedName, args, flOdbScript: true});
					return (callOdbScript (value, args, dottedName));
					}
				}
			catch (err) {
				if (err.flRethrow === true) {
					throw err;
					}
				//fall through to the unknown-verb error below
				}
			if (environment.resolveExternalScript !== undefined) { //a sibling build script called by name
				const external = environment.resolveExternalScript (dottedName);
				if (external !== undefined) {
					environment.trace.push ({verb: dottedName, args, flExternalScript: true});
					return (callOdbScript (external, args, dottedName));
					}
				}
			const message = "Can't call " + dottedName + " because it isn't a verb, a handler or a script.";
			throw new Error (message);
			}
		
		//calling through a computed value
		const fn = evalExpr (theNode.fn);
		if ((fn !== undefined) && (fn.flHandler === true)) {
			return (callHandler (fn, args));
			}
		if (typeof fn === "function") {
			environment.trace.push ({verb: pathTextForNode (theNode.fn), args});
			return (fn (args, environment));
			}
		const message = "Can't call " + pathTextForNode (theNode.fn) + " because it isn't a verb, a handler or a script.";
		throw new Error (message);
		}
	
	function callHandler (theHandler, theArgs) {
		
		const frame = {vars: {}};
		
		const savedFrames = environment.frames;
		environment.frames = theHandler.closureFrames.concat ([frame]);
		
		theHandler.params.forEach (function (param, ixParam) {
			var value = theArgs [ixParam];
			if (value === undefined) {
				if (param.value !== undefined) {
					value = evalExpr (param.value); //defaults see the params already bound: on copyone (a, b=a)
					}
				}
			frame.vars [param.name] = value;
			});
		
		try {
			const result = evaluate (theHandler.body, environment);
			return (result);
			}
		catch (signal) {
			if (signal.flReturnSignal) {
				return (signal.value);
				}
			throw signal;
			}
		finally {
			environment.frames = savedFrames;
			}
		}
	
	function callOdbScript (theScript, theArgs, theName) {
		
		/*  A script value from the odb, called like a verb: parse it once,
			evaluate its module (skipping test-code bundles), then call the
			handler named for it -- Frontier's script-call semantics.  */
		
		if (theScript.parsedStatements === undefined) {
			if (environment.parseScript === undefined) {
				const message = "Can't call " + theName + " because no script parser is installed.";
				throw new Error (message);
				}
			theScript.parsedStatements = environment.parseScript (theScript.lines);
			}
		
		const moduleFrame = {vars: {}};
		const savedFrames = environment.frames;
		environment.frames = [moduleFrame];
		
		try {
			const statements = [];
			theScript.parsedStatements.forEach (function (statement) {
				if (statement.op !== "bundle") { //a top-level bundle is test code, it doesn't run on a call
					statements.push (statement);
					}
				});
			const moduleValue = evaluate (statements, environment);
			
			const parts = theName.split (".");
			const shortName = parts [parts.length - 1];
			var handlerKey = findKey (moduleFrame.vars, shortName);
			
			if (handlerKey === undefined) {
				const handlerNames = [];
				Object.keys (moduleFrame.vars).forEach (function (key) {
					const value = moduleFrame.vars [key];
					if ((value !== undefined) && (value.flHandler === true)) {
						handlerNames.push (key);
						}
					});
				if (handlerNames.length === 1) {
					handlerKey = handlerNames [0];
					}
				else {
					if (handlerNames.length === 0) { //a straight-code script: the module run was the call
						return (moduleValue);
						}
					}
				}
			
			if (handlerKey === undefined) {
				const message = "Can't call " + theName + " because its script doesn't define a handler by that name.";
				throw new Error (message);
				}
			
			return (callHandler (moduleFrame.vars [handlerKey], theArgs));
			}
		catch (err) {
			err.flRethrow = true;
			throw err;
			}
		finally {
			environment.frames = savedFrames;
			}
		}
	
	function currentFrame () {
		if (environment.frames.length === 0) {
			environment.frames.push ({vars: {}});
			}
		return (environment.frames [environment.frames.length - 1]);
		}
	
	function runBody (theBody) {
		return (evaluate (theBody, environment));
		}
	
	//statements
	
	theStatements.forEach (function (statement) {
		
		switch (statement.op) {
			
			case "noop":
				break;
			
			case "sequence":
				lastValue = evaluate (statement.statements, environment);
				break;
			
			case "handler": {
				const handlerRec = {
					flHandler: true,
					name: statement.name,
					params: statement.params,
					body: statement.body,
					closureFrames: environment.frames.slice ()
					};
				currentFrame ().vars [statement.name] = handlerRec;
				break;
				}
			
			case "local": case "global": {
				statement.inits.forEach (function (init) {
					var value;
					if (init.value !== undefined) {
						value = evalExpr (init.value);
						}
					if (statement.op === "local") {
						currentFrame ().vars [init.name] = value;
						}
					else {
						if (findKey (environment.odb, init.name) === undefined) {
							environment.odb [init.name] = value;
							}
						}
					});
				break;
				}
			
			case "assign":
				referenceForNode (statement.target).set (evalExpr (statement.value));
				break;
			
			case "expression":
				lastValue = evalExpr (statement.expr);
				break;
			
			case "if":
				if (flTrue (evalExpr (statement.test))) {
					runBody (statement.body);
					}
				else {
					if (statement.elseBody !== undefined) {
						runBody (statement.elseBody);
						}
					}
				break;
			
			case "loop": case "loop3": case "while": {
				var guard = 0;
				const maxIterations = 1000000;
				
				if (statement.op === "loop3") {
					evaluate ([statement.init], environment);
					}
				
				var count;
				if ((statement.op === "loop") && (statement.count !== undefined)) {
					count = evalExpr (statement.count);
					}
				
				while (true) {
					guard++;
					if (guard > maxIterations) {
						const message = "Can't finish the loop because it ran " + maxIterations + " times.";
						throw new Error (message);
						}
					if ((count !== undefined) && (guard > count)) {
						break;
						}
					if ((statement.op === "while") && !flTrue (evalExpr (statement.test))) {
						break;
						}
					if ((statement.op === "loop3") && !flTrue (evalExpr (statement.test))) {
						break;
						}
					try {
						runBody (statement.body);
						}
					catch (signal) {
						if (signal.flBreakSignal) {
							break;
							}
						if (!signal.flContinueSignal) {
							throw signal;
							}
						}
					if (statement.op === "loop3") {
						evaluate ([statement.step], environment);
						}
					}
				break;
				}
			
			case "for": {
				const from = evalExpr (statement.from);
				const limit = evalExpr (statement.limit);
				var counter = from;
				while (statement.flDown ? (counter >= limit) : (counter <= limit)) {
					currentFrame ().vars [statement.name] = counter;
					try {
						runBody (statement.body);
						}
					catch (signal) {
						if (signal.flBreakSignal) {
							break;
							}
						if (!signal.flContinueSignal) {
							throw signal;
							}
						}
					counter = statement.flDown ? counter - 1 : counter + 1;
					}
				break;
				}
			
			case "forin": {
				const list = evalExpr (statement.list);
				var items = list;
				if ((list !== undefined) && (list.flAddress === true)) { //for x in @table walks the table's values
					items = [];
					const table = list.reference.get ();
					Object.keys (table).forEach (function (key) {
						items.push (table [key]);
						});
					}
				var flBroke = false;
				items.forEach (function (item) {
					if (flBroke) {
						return;
						}
					currentFrame ().vars [statement.name] = item;
					try {
						runBody (statement.body);
						}
					catch (signal) {
						if (signal.flBreakSignal) {
							flBroke = true;
							return;
							}
						if (!signal.flContinueSignal) {
							throw signal;
							}
						}
					});
				break;
				}
			
			case "fileloop": {
				const folder = evalExpr (statement.folder);
				var depth = 1;
				if (statement.depth !== undefined) {
					depth = evalExpr (statement.depth);
					}
				const fileloopVerb = environment.verbs ["fileloop.list"];
				if (fileloopVerb === undefined) {
					const message = "Can't run the fileloop because no fileloop.list verb is installed.";
					throw new Error (message);
					}
				const paths = fileloopVerb ([folder, depth], environment);
				var flBroke = false;
				paths.forEach (function (thePath) {
					if (flBroke) {
						return;
						}
					currentFrame ().vars [statement.name] = thePath;
					try {
						runBody (statement.body);
						}
					catch (signal) {
						if (signal.flBreakSignal) {
							flBroke = true;
							return;
							}
						if (!signal.flContinueSignal) {
							throw signal;
							}
						}
					});
				break;
				}
			
			case "bundle":
				runBody (statement.body);
				break;
			
			case "with": {
				const table = evalExpr (statement.path);
				var withTable = table;
				if ((table !== undefined) && (table.flAddress === true)) {
					withTable = table.reference.get ();
					}
				environment.withPaths.push (withTable);
				try {
					runBody (statement.body);
					}
				finally {
					environment.withPaths.pop ();
					}
				break;
				}
			
			case "try":
				try {
					runBody (statement.body);
					}
				catch (signal) {
					if (signal.flBreakSignal || signal.flContinueSignal || signal.flReturnSignal) {
						throw signal;
						}
					currentFrame ().vars ["tryerror"] = signal.message;
					if (statement.elseBody !== undefined) {
						runBody (statement.elseBody);
						}
					}
				break;
			
			case "case": {
				const value = evalExpr (statement.value);
				var flMatched = false;
				statement.clauses.forEach (function (clause) {
					if (flMatched) {
						return;
						}
					const pair = coerceForCompare (value, evalExpr (clause.value));
					if (pair.left == pair.right) {
						flMatched = true;
						runBody (clause.body);
						}
					});
				if (!flMatched && (statement.elseBody !== undefined)) {
					runBody (statement.elseBody);
					}
				break;
				}
			
			case "return":
				throw new ReturnSignal (statement.value === undefined ? undefined : evalExpr (statement.value));
			
			case "break":
				throw new BreakSignal ();
			
			case "continue":
				throw new ContinueSignal ();
			
			default: {
				const message = "Can't run the statement because the operator " + statement.op + " isn't implemented.";
				throw new Error (message);
				}
			}
		});
	
	return (lastValue);
	}

exports.makeEnvironment = makeEnvironment;
exports.evaluate = evaluate;
exports.findKey = findKey;
