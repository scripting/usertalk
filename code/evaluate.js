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
	installEnvironmentTable (theOdb);
	return (environment);
	}

function installEnvironmentTable (theOdb) {
	/*  7/27/26 by CC -- system.environment is kernel-populated machine
		facts. We claim to be none of the classic platforms, so scripts
		skip Mac text conversion and Windows path fixups.  */
	if (theOdb.system === undefined) {
		theOdb.system = {};
		}
	if (findKey (theOdb.system, "environment") === undefined) {
		theOdb.system.environment = {
			isMac: false,
			isWindows: false,
			isUnix: true,
			isRadio: false,
			isFrontier: true,
			isPike: false
			};
		}
	if (findKey (theOdb.system, "temp") === undefined) {
		theOdb.system.temp = {Frontier: {}}; //the kernel makes system.temp at boot
		}
	if (findKey (theOdb, "temp") === undefined) {
		theOdb.temp = theOdb.system.temp; //the paths table makes temp mean system.temp; same table, two names
		}
	}

const languageConstants = { //type names match what the typeof verb returns, so case statements compare true
	nil: undefined, "this": undefined,
	tabletype: "tabletype", outlinetype: "outlinetype", scripttype: "scripttype",
	wptexttype: "wptexttype", binarytype: "binarytype", stringtype: "stringtype",
	booleantype: "booleantype", datetype: "datetype", numbertype: "numbertype",
	longtype: "numbertype", inttype: "numbertype", doubletype: "numbertype",
	listtype: "listtype", recordtype: "recordtype", addresstype: "addresstype",
	unknowntype: "unknowntype",
	menubartype: "menubartype", picttype: "picttype", filespectype: "filespectype",
	codetype: "codetype", rgbtype: "rgbtype", pointtype: "pointtype",
	recttype: "recttype", chartype: "chartype", patterntype: "patterntype",
	fixedtype: "fixedtype", singletype: "singletype", objspectype: "objspectype",
	cr: "\r", lf: "\n", tab: "\t", space: " ", //the character constants
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

function sortedTableKeys (theTable) {
	/*  7/27/26 by CC -- Frontier tables are always sorted by name,
		case-insensitive, so "#prefs" comes before "default" and nth-entry
		access sees that order. JS objects remember insertion order, so
		every positional walk sorts first.  */
	if ((theTable === undefined) || (theTable === null) || (typeof theTable !== "object")) {
		return ([]); //not a table: no entries to walk, the way an empty table behaves
		}
	const keys = Object.keys (theTable);
	keys.sort (function (a, b) {
		const lowerA = a.toLowerCase (), lowerB = b.toLowerCase ();
		if (lowerA < lowerB) {
			return (-1);
			}
		if (lowerA > lowerB) {
			return (1);
			}
		return (0);
		});
	return (keys);
	}

function findKey (theTable, theName) { //case-insensitive key lookup, returns the real key or undefined
	if ((theTable === undefined) || (theTable === null) || (typeof theTable !== "object")) {
		return (undefined); //nothing to look in
		}
	if (theTable [theName] !== undefined) {
		return (theName);
		}
	
	/*  8/4/26 by CC -- a database table looks its children up by lowername, so
		the access above was ALREADY case-insensitive and there is nothing a
		scan could find that it missed. Asking "in" costs one query; enumerating
		cost one per entry, and it ran on every miss -- 7.2 million queries in a
		single sallysReader build, which was all of the build's 25 seconds.  */
	
	if (theTable.flOdbSqlTable === true) {
		if (theName in theTable) { //an entry that holds no value: present, but undefined on read
			return (theName);
			}
		return (undefined);
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
					container: vars,
					key: key,
					get: function () {
						return (vars [key]);
						},
					set: function (theValue) {
						vars [key] = theValue;
						},
					remove: function () {
						delete vars [key];
						}
					});
				}
			}
		
		var ixWith;
		for (ixWith = environment.withPaths.length - 1; ixWith >= 0; ixWith--) {
			const withTable = environment.withPaths [ixWith];
			if ((withTable === undefined) || (withTable === null) || (typeof withTable !== "object")) {
				continue; //a with over a missing table scopes nothing
				}
			const key = findKey (withTable, theName);
			if (key !== undefined) {
				return ({
					container: withTable,
					key: key,
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
				container: environment.odb,
				key: odbKey,
				get: function () {
					return (environment.odb [odbKey]);
					},
				set: function (theValue) {
					environment.odb [odbKey] = theValue;
					},
				remove: function () {
					delete environment.odb [odbKey];
					}
				});
			}
		
		/*  7/27/26 by CC -- the system.paths fallback: a name that resolves
			nowhere else is looked up the way Frontier's paths table works,
			so string.upper finds system.verbs.builtins.string.upper and
			manilaSuite finds a suite wherever the loaded roots put it.  */
		
		var found;
		pathsTablesForOdb (environment.odb).forEach (function (pathsTable) {
			if (found === undefined) {
				const key = findKey (pathsTable, theName);
				if (key !== undefined) {
					found = {
						get: function () {
							return (pathsTable [key]);
							},
						set: function (theValue) {
							pathsTable [key] = theValue;
							},
						remove: function () {
							delete pathsTable [key];
							}
						};
					}
				}
			});
		if (found !== undefined) {
			return (found);
			}
		
		return (undefined);
		}
	
	function pathsTablesForOdb (theOdb) { //the tables system.paths searches, in Frontier's order
		const tables = [];
		const addressTexts = ["system.verbs.globals", "system.verbs.builtins", "system.verbs.apps", "system.verbs.suites", "suites"];
		addressTexts.forEach (function (addressText) {
			var current = theOdb;
			addressText.split (".").forEach (function (part) {
				if ((current !== undefined) && (current !== null) && (typeof current === "object")) {
					const key = findKey (current, part);
					current = (key === undefined) ? undefined : current [key];
					}
				else {
					current = undefined;
					}
				});
			if ((current !== undefined) && (current !== null) && (typeof current === "object") && (current.flOdbScript === undefined)) {
				tables.push (current);
				}
			});
		return (tables);
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
						},
					remove: function () {
						delete container [keyFinal];
						}
					});
				}
			
			case "index": {
				const container = evalExpr (theNode.left);
				const index = evalExpr (theNode.index);
				if (typeof container === "string") { //7/27/26 by CC -- s [3] is the third character, 1-based
					return ({
						get: function () {
							return (container.charAt (index - 1));
							},
						set: function (theValue) {
							const message = "Can't assign into a character of a string this way because the string was copied when it was read.";
							throw new Error (message);
							}
						});
					}
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
					if ((typeof index === "number") && (theNode.flComputedName !== true)) { //bare subscript: nth entry, in Frontier's sorted order
						const keys = sortedTableKeys (container);
						var keyAt = keys [index - 1];
						if (keyAt === undefined) {
							keyAt = String (index); //writing the nth entry of a table that doesn't have one yet: the number becomes the name
							}
						return ({
							get: function () {
								return (container [keyAt]);
								},
							set: function (theValue) {
								container [keyAt] = theValue;
								},
							remove: function () {
								delete container [keyAt];
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
							},
						remove: function () {
							delete container [keyFinal];
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
	
	function lazyAddressForNode (theNode) {
		
		/*  7/27/26 by CC -- build a path-shaped address without touching the
			database: a base plus name parts. Computed parts ([expr]) evaluate
			now; the walk to the value happens each time the address is used.
			Returns undefined when the expression isn't a path shape, and the
			caller falls back to an eager reference.  */
		
		const parts = [];
		var node = theNode;
		
		while ((node.op === "dot") || (node.op === "index")) {
			if (node.op === "dot") {
				parts.unshift (node.name);
				node = node.left;
				}
			else {
				const indexValue = evalExpr (node.index);
				if ((typeof indexValue === "number") && (node.flComputedName !== true)) {
					parts.unshift ({flNth: indexValue}); //bare subscript: nth entry, resolved against the sorted table when the walk reaches it
					}
				else {
					parts.unshift (String (indexValue));
					}
				node = node.left;
				}
			}
		
		var resolveBase;
		var baseText;
		if (node.op === "computedid") {
			/*  [f].site -- the base name computes now (usually a database's
				full path); the walk from it stays lazy. The path text keeps
				the bracket form so it can be parsed back.  */
			const computedName = String (evalExpr (node.expr));
			baseText = "[" + computedName + "]";
			resolveBase = function () {
				const reference = referenceForId (computedName);
				if (reference === undefined) {
					return (undefined);
					}
				return (reference.get ());
				};
			}
		else {
			if (node.op === "id") {
				/*  The base binds to its CELL now, at address time -- an
					address handed to another script keeps pointing at the
					caller's local, the way an objspec does. Only a base that
					doesn't exist yet falls back to by-name lookup at use.  */
				const baseName = node.name;
				baseText = baseName;
				const boundReference = referenceForId (baseName);
				resolveBase = function (flCreate) {
					var reference = boundReference;
					if (reference === undefined) {
						reference = referenceForId (baseName);
						}
					if (reference === undefined) {
						return (undefined);
						}
					var value = reference.get ();
					if (flCreate && ((value === undefined) || (value === null) || (typeof value !== "object"))) {
						reference.set ({}); //assignment through the address makes the table on the way
						value = reference.get ();
						}
					return (value);
					};
				}
			else {
				if (node.op === "deref") {
					/*  @adr^.x -- chase the inner address now, walk from its
						target lazily. When the chain is broken (@pta^.newsSite^.y
						with no newsSite), the address still gets built -- it
						answers undefined on get, and errors on use, not on
						construction, the way Frontier objspecs behave.  */
					var innerAddress;
					try {
						innerAddress = evalExpr (node.expr);
						}
					catch (err) {
						innerAddress = undefined;
						}
					baseText = "(deref)";
					if ((innerAddress !== undefined) && (innerAddress !== null) && (innerAddress.flAddress === true)) {
						baseText = innerAddress.pathText;
						}
					resolveBase = function () {
						if ((innerAddress === undefined) || (innerAddress === null) || (innerAddress.flAddress !== true)) {
							return (undefined);
							}
						return (innerAddress.reference.get ());
						};
					}
				else {
					return (undefined);
					}
				}
			}
		
		if (parts.length === 0) {
			return (undefined); //@name alone: the eager reference already has the right meaning
			}
		
		function keyForPart (theContainer, thePart, flCreate) {
			/*  A part is a name, or {flNth} for a numeric subscript, which
				resolves against the table in Frontier's sorted order.  */
			if ((thePart !== null) && (typeof thePart === "object") && (thePart.flNth !== undefined)) {
				const key = sortedTableKeys (theContainer) [thePart.flNth - 1];
				if (key === undefined) {
					return (flCreate ? String (thePart.flNth) : undefined);
					}
				return (key);
				}
			var key = findKey (theContainer, thePart);
			if ((key === undefined) && flCreate) {
				key = thePart;
				}
			return (key);
			}
		
		function partText (thePart) {
			if ((thePart !== null) && (typeof thePart === "object") && (thePart.flNth !== undefined)) {
				return ("[" + thePart.flNth + "]");
				}
			return (String (thePart));
			}
		
		function walkToParent (flCreate) { //the table holding the last part, or undefined
			var current = resolveBase (flCreate);
			var ixPart;
			for (ixPart = 0; ixPart < parts.length - 1; ixPart++) {
				if ((current === undefined) || (current === null) || (typeof current !== "object")) {
					return (undefined);
					}
				const key = keyForPart (current, parts [ixPart], flCreate);
				if (key === undefined) {
					return (undefined);
					}
				if (current [key] === undefined) {
					if (!flCreate) {
						return (undefined);
						}
					current [key] = {};
					}
				else {
					if (flCreate && ((current [key] === null) || (typeof current [key] !== "object"))) {
						current [key] = {};
						}
					}
				current = current [key];
				}
			return (current);
			}
		
		const lastPart = parts [parts.length - 1];
		
		function lastKeyIn (theParent, flCreate) {
			return (keyForPart (theParent, lastPart, flCreate));
			}
		
		const reference = {
			get: function () {
				const parent = walkToParent (false);
				if ((parent === undefined) || (parent === null) || (typeof parent !== "object")) {
					return (undefined);
					}
				const key = lastKeyIn (parent, false);
				if (key === undefined) {
					return (undefined);
					}
				return (parent [key]);
				},
			set: function (theValue) {
				const parent = walkToParent (true);
				if ((parent === undefined) || (parent === null) || (typeof parent !== "object")) {
					const message = "Can't set the value at " + pathText + " because the path can't be reached.";
					throw new Error (message);
					}
				parent [lastKeyIn (parent, true)] = theValue;
				},
			remove: function () {
				const parent = walkToParent (false);
				if ((parent === undefined) || (parent === null) || (typeof parent !== "object")) {
					return;
					}
				const key = lastKeyIn (parent, false);
				if (key !== undefined) {
					delete parent [key];
					}
				}
			};
		
		/*  The path as text: nth parts read their real entry name when the
			table is reachable now, so nameOf answers the name, not a number.  */
		const textParts = [];
		var probe = resolveBase ();
		parts.forEach (function (part) {
			var text = partText (part);
			if ((probe !== undefined) && (probe !== null) && (typeof probe === "object")) {
				const key = keyForPart (probe, part, false);
				if (key !== undefined) {
					text = key;
					probe = probe [key];
					}
				else {
					probe = undefined;
					}
				}
			else {
				probe = undefined;
				}
			textParts.push (text);
			});
		
		var pathText = baseText + "." + textParts.join (".");
		
		/*  8/5/26 by CC -- the address remembers its own last component. Splitting
			pathText on dots can't recover it: a computed part resolves to the real
			entry name, and Manila's membership tables are named by email address,
			so users.["dave@example.com"] would answer "com".  */
		var nameText = textParts [textParts.length - 1];
		
		return ({reference, pathText, nameText});
		}
	
	//expressions
	
	function flListsEqual (left, right) {
		/*  7/28/26 by CC -- lists compare by value, not by identity: the
			corpus is full of "if theList == {}" as an emptiness test, and
			comparing two JS arrays by reference makes that always false.  */
		if (!Array.isArray (left) || !Array.isArray (right)) {
			return (false); //a list is never equal to a non-list
			}
		if (left.length !== right.length) {
			return (false);
			}
		var flSame = true;
		left.forEach (function (item, ixItem) {
			if (!flSame) {
				return;
				}
			const other = right [ixItem];
			if (Array.isArray (item) || Array.isArray (other)) {
				flSame = flListsEqual (item, other);
				}
			else {
				const pair = coerceForCompare (item, other);
				if (pair.left != pair.right) {
					flSame = false;
					}
				}
			});
		return (flSame);
		}
	
	function addressPathText (theValue) { //8/5/26 by CC -- the path an address stands for, or undefined when it isn't one
		if ((theValue !== undefined) && (theValue !== null) && (theValue.flAddress === true)) {
			return (String (theValue.pathText));
			}
		return (undefined);
		}
	
	function coerceForCompare (left, right) {
		
		/*  An address compares by the path it names, the way Frontier compares
			objspecs -- two addresses built separately for the same place are
			equal. Comparing them as JS objects made every such test false, and
			Manila leans on it: getCanonicalSiteName asks whether an entry in
			config.manila.sites is this site, and answered no for the site it
			was standing in.  */
		const leftPath = addressPathText (left);
		const rightPath = addressPathText (right);
		if ((leftPath !== undefined) || (rightPath !== undefined)) {
			const leftText = (leftPath === undefined) ? String (left) : leftPath;
			const rightText = (rightPath === undefined) ? String (right) : rightPath;
			return ({left: leftText.toLowerCase (), right: rightText.toLowerCase ()});
			}
		
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
				/*  7/27/26 by CC -- an address is symbolic, the way Frontier
					treats it: taking @config.x.y never touches the database,
					and the path resolves each time the address is used. So
					@a.b.c is legal when b doesn't exist yet, defined (adr^)
					answers false, and assigning through the address creates
					the missing parent tables.  */
				const lazy = lazyAddressForNode (theNode.expr);
				if (lazy !== undefined) {
					return ({flAddress: true, reference: lazy.reference, pathText: lazy.pathText, nameText: lazy.nameText});
					}
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
			
			case "add": {
				/*  7/28/26 by CC -- an unset value adds as nothing: Frontier
					locals start empty, so s = s + "text" builds the string
					from the first line, and n = n + 1 counts from zero.  */
				var left = evalExpr (theNode.left), right = evalExpr (theNode.right);
				if (Array.isArray (left)) { //adding to a list appends: {1, 2} + 3 is {1, 2, 3}, and a list adds its items
					return (left.concat (Array.isArray (right) ? right : [right]));
					}
				if (Array.isArray (right)) {
					return ([left].concat (right));
					}
				if ((left instanceof Date) && (typeof right === "number")) { //date arithmetic is in seconds
					return (new Date (left.getTime () + (right * 1000)));
					}
				if ((typeof left === "number") && (right instanceof Date)) {
					return (new Date (right.getTime () + (left * 1000)));
					}
				if ((left === undefined) || (right === undefined)) {
					const present = (left === undefined) ? right : left;
					if (typeof present === "string") {
						left = (left === undefined) ? "" : left;
						right = (right === undefined) ? "" : right;
						}
					else {
						if (typeof present === "number") {
							left = (left === undefined) ? 0 : left;
							right = (right === undefined) ? 0 : right;
							}
						}
					}
				return (left + right);
				}
			
			case "subtract": {
				const left = evalExpr (theNode.left), right = evalExpr (theNode.right);
				if (left instanceof Date) { //date arithmetic is in seconds: date - date answers seconds, date - seconds shifts
					if (right instanceof Date) {
						return ((left.getTime () - right.getTime ()) / 1000);
						}
					if (typeof right === "number") {
						return (new Date (left.getTime () - (right * 1000)));
						}
					}
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
				const leftValue = evalExpr (theNode.left), rightValue = evalExpr (theNode.right);
				if (Array.isArray (leftValue) || Array.isArray (rightValue)) {
					return (flListsEqual (leftValue, rightValue));
					}
				const pair = coerceForCompare (leftValue, rightValue);
				return (pair.left == pair.right); //loose on purpose: Frontier coerces across types
				}
			
			case "ne": {
				const leftValue = evalExpr (theNode.left), rightValue = evalExpr (theNode.right);
				if (Array.isArray (leftValue) || Array.isArray (rightValue)) {
					return (!flListsEqual (leftValue, rightValue));
					}
				const pair = coerceForCompare (leftValue, rightValue);
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
		
		/*  7/27/26 by CC -- defined is a special form, the way the kernel
			treats it: if walking to the value fails because a parent table
			isn't there, the answer is false, not an error.  */
		
		if ((theNode.fn.op === "id") && (theNode.fn.name.toLowerCase () === "defined") && (theNode.args.length === 1)) {
			var definedValue;
			try {
				definedValue = evalExpr (theNode.args [0]);
				}
			catch (err) {
				return (false);
				}
			return (definedValue !== undefined);
			}
		
		/*  8/4/26 by CC -- evaluate is a special form: the kernel compiles the
			string and runs it in the current scope, so the caller's locals are
			visible to the evaluated code. The build script at the end of
			uploadScripts is the customer. An empty or missing script answers
			nil, the way a project with no build script expects.  */
		
		if ((theNode.fn.op === "id") && (theNode.fn.name.toLowerCase () === "evaluate") && (theNode.args.length === 1)) {
			const scriptValue = evalExpr (theNode.args [0]);
			if ((scriptValue === undefined) || (scriptValue === null)) {
				return (undefined);
				}
			var scriptText;
			if (scriptValue.flOdbScript === true) {
				scriptText = environment.verbs ["string"] ([scriptValue]);
				}
			else {
				if ((typeof scriptValue === "object") && (scriptValue.flWpText !== true)) {
					const message = "Can't evaluate the script because the value is a " + environment.verbs ["typeof"] ([scriptValue]) + ", not text.";
					throw new Error (message); //without this the object stringifies to "[object Object]" and the parser's complaint names neither the value nor the caller
					}
				scriptText = String (scriptValue);
				}
			if (scriptText.trim ().length === 0) {
				return (undefined);
				}
			if (environment.parseScript === undefined) {
				const message = "Can't evaluate the script because this environment has no script parser.";
				throw new Error (message);
				}
			const theLines = [];
			scriptText.split (/\r\n|\r|\n/).forEach (function (line) { //a stored script stringifies with returns, a rendered one with linefeeds
				const withoutTabs = line.replace (/^\t+/, "");
				if (withoutTabs.trim ().length > 0) {
					theLines.push ({level: line.length - withoutTabs.length, text: withoutTabs, flComment: false});
					}
				});
			const theStatements = environment.parseScript (theLines);
			environment.trace.push ({verb: "evaluate", args: [scriptText.slice (0, 80)]});
			return (evaluate (theStatements, environment));
			}
		
		/*  7/27/26 by CC -- nameOf is a path question, not a value question:
			nameOf (adr^) answers the name of the cell the address points to,
			nameOf (config.manila) answers "manila".  */
		
		if ((theNode.fn.op === "id") && (theNode.fn.name.toLowerCase () === "parentof") && (theNode.args.length === 1)) {
			/*  parentOf (adr^) answers the address of the table holding the
				cell -- a path question, answered by trimming the path. Given
				a bare value, the kernel knew its cell; here an identity
				index over the odb answers instead.  */
			const argNode = theNode.args [0];
			var addressForParent;
			var argValue;
			if (argNode.op === "deref") {
				addressForParent = evalExpr (argNode.expr);
				}
			else {
				if (argNode.op === "id") {
					/*  parentOf (host) -- the classic way to reach the table a
						cell lives in, usually the param table via with-scope.
						The resolved reference knows its container.  */
					const idReference = referenceForId (argNode.name);
					if ((idReference !== undefined) && (idReference.container !== undefined) && (idReference.container !== environment.odb)) {
						const homeTable = idReference.container;
						var flFrameVars = false;
						environment.frames.forEach (function (frame) {
							if (frame.vars === homeTable) {
								flFrameVars = true;
								}
							});
						if (!flFrameVars) { //locals have no odb parent; a with-scoped cell does
							const homeFound = findValueHome (homeTable);
							return ({
								flAddress: true,
								pathText: (homeFound === undefined) ? "(parent)" : homeFound.ownPath,
								reference: {
									get: function () {
										return (homeTable);
										},
									set: function (theValue) {
										const message = "Can't assign through a parent found by scope.";
										throw new Error (message);
										},
									remove: function () {
										}
									}
								});
							}
						}
					}
				argValue = evalExpr (argNode);
				if ((argValue !== undefined) && (argValue !== null) && (argValue.flAddress === true)) {
					addressForParent = argValue;
					}
				}
			if ((addressForParent === undefined) && (argValue !== null) && (typeof argValue === "object")) {
				const found = findValueHome (argValue);
				if (found !== undefined) {
					const homeContainer = found.container;
					return ({
						flAddress: true,
						pathText: found.containerPath,
						reference: {
							get: function () {
								return (homeContainer);
								},
							set: function (theValue) {
								const message = "Can't assign through a parent found by value.";
								throw new Error (message);
								},
							remove: function () {
								}
							}
						});
					}
				}
			if ((addressForParent !== undefined) && (addressForParent.flAddress === true)) {
				
				/*  Identity is the careful answer -- the value the address leads
					to knows its home table, and that never trips over names with
					dots in them, the way trimming path text would. But it costs
					a full walk of the database, so it is the SECOND choice:
					8/4/26 by CC, when the address carries a real path, the
					trimming below is exact and free, and only a path we can't
					read (a bare deref, a parent found by scope) falls through to
					the walk.  */
				
				const thePathForParent = addressForParent.pathText;
				const flRealPath = (typeof thePathForParent === "string") && (thePathForParent.length > 0) && (thePathForParent.indexOf ("(") !== 0);
				
				const targetValue = (flRealPath) ? undefined : addressForParent.reference.get ();
				if ((targetValue !== undefined) && (targetValue !== null) && (typeof targetValue === "object")) {
					const targetFound = findValueHome (targetValue);
					if (targetFound !== undefined) {
						const targetContainer = targetFound.container;
						return ({
							flAddress: true,
							pathText: targetFound.containerPath,
							reference: {
								get: function () {
									return (targetContainer);
									},
								set: function (theValue) {
									const message = "Can't assign through a parent found by value.";
									throw new Error (message);
									},
								remove: function () {
									}
								}
							});
						}
					}
				/*  Fall back to trimming the last path component -- a database
					name in brackets can hold dots, so only a dot outside
					brackets separates components.  */
				const fullText = addressForParent.pathText;
				var ixLastDot = -1;
				var depth = 0;
				var ixScan;
				for (ixScan = 0; ixScan < fullText.length; ixScan++) {
					const ch = fullText.charAt (ixScan);
					if (ch === "[") {
						depth++;
						}
					if (ch === "]") {
						depth--;
						}
					if ((ch === ".") && (depth === 0)) {
						ixLastDot = ixScan;
						}
					}
				const parentText = (ixLastDot === -1) ? "" : fullText.slice (0, ixLastDot);
				const parseAddressVerb = environment.verbs ["string.parseaddress"];
				if ((parentText.length > 0) && (parentText.indexOf ("(") !== 0) && (parseAddressVerb !== undefined)) {
					return (parseAddressVerb ([parentText], environment));
					}
				}
			return (undefined); //no parent to be had: the top of the database answers nil, so pop-to-root loops terminate
			}
		
		if ((theNode.fn.op === "id") && (theNode.fn.name.toLowerCase () === "nameof") && (theNode.args.length === 1)) {
			const argNode = theNode.args [0];
			
			function lastPathComponent (thePathText) { //the part after the last dot outside brackets
				var ixLastDot = -1;
				var depth = 0;
				var ixScan;
				for (ixScan = 0; ixScan < thePathText.length; ixScan++) {
					const ch = thePathText.charAt (ixScan);
					if (ch === "[") {
						depth++;
						}
					if (ch === "]") {
						depth--;
						}
					if ((ch === ".") && (depth === 0)) {
						ixLastDot = ixScan;
						}
					}
				return (thePathText.slice (ixLastDot + 1));
				}
			
			var addressForName;
			if (argNode.op === "deref") {
				addressForName = evalExpr (argNode.expr);
				}
			else {
				if ((argNode.op === "dot") || (argNode.op === "index")) {
					/*  nameOf (table [i]) and nameOf (a.b.c) are path questions:
						the lazy address resolves the real entry name, nth
						subscripts included.  */
					const lazy = lazyAddressForNode (argNode);
					if (lazy !== undefined) {
						if (lazy.nameText !== undefined) { //8/5/26 by CC -- the address knows its own name; the path text can't be split back apart when a name contains dots
							return (lazy.nameText);
							}
						return (lastPathComponent (lazy.pathText));
						}
					}
				const argValue = evalExpr (argNode);
				if ((argValue !== undefined) && (argValue !== null) && (argValue.flAddress === true)) {
					addressForName = argValue;
					}
				else {
					if (argNode.op === "dot") {
						return (argNode.name);
						}
					if (argNode.op === "id") {
						return (argNode.name);
						}
					return (String (argValue));
					}
				}
			if ((addressForName !== undefined) && (addressForName.flAddress === true)) {
				if (addressForName.nameText !== undefined) { //8/5/26 by CC
					return (addressForName.nameText);
					}
				return (lastPathComponent (addressForName.pathText));
				}
			return (String (addressForName));
			}
		
		/*  7/27/26 by CC -- the kernel thunk: a builtin's script body is
			"on xxx (params)" over the single line "kernel (path.to.verb)".
			Dispatch to the JS verb table with the enclosing handler's
			arguments; a missing kernel verb fails loudly by name, so every
			gap in the verb library announces itself.  */
		
		if ((theNode.fn.op === "id") && (theNode.fn.name.toLowerCase () === "kernel") && (theNode.args.length === 1)) {
			const kernelName = dottedNameForNode (theNode.args [0]);
			if (kernelName !== undefined) {
				const kernelVerb = environment.verbs [kernelName.toLowerCase ()];
				const kernelArgs = (currentFrame ().callArgs === undefined) ? [] : currentFrame ().callArgs;
				if (kernelVerb === undefined) {
					/*  Screen verbs are no-ops here -- there is no screen. An
						is-question answers false, everything else claims
						success. Every other missing kernel verb still fails
						loudly by name.  */
					const screenPrefixes = ["menu.", "window.", "speaker.", "mouse.", "kb.", "clipboard."];
					var flScreenVerb = false;
					screenPrefixes.forEach (function (prefix) {
						if (kernelName.toLowerCase ().indexOf (prefix) === 0) {
							flScreenVerb = true;
							}
						});
					if (flScreenVerb) {
						const shortName = kernelName.toLowerCase ().split (".").pop ();
						environment.trace.push ({verb: kernelName, args: kernelArgs, flKernel: true, flScreenNoOp: true});
						return (shortName.indexOf ("is") !== 0);
						}
					const message = "Can't call the kernel verb " + kernelName + " because it isn't implemented in the verb library.";
					throw new Error (message);
					}
				environment.trace.push ({verb: kernelName, args: kernelArgs, flKernel: true});
				return (kernelVerb (kernelArgs, environment));
				}
			}
		
		const args = [];
		const argNames = []; //7/27/26 by CC -- flEmptyBodyOk:true binds by name, not position
		theNode.args.forEach (function (argNode) {
			args.push (evalExpr (argNode));
			argNames.push ((argNode.op === "namedarg") ? argNode.name : undefined);
			});
		
		//a handler defined in scope?
		
		const dottedName = dottedNameForNode (theNode.fn);
		
		if (theNode.fn.op === "id") {
			const reference = referenceForId (theNode.fn.name);
			if (reference !== undefined) {
				const value = reference.get ();
				if ((value !== undefined) && (value.flHandler === true)) {
					return (callHandler (value, args, argNames));
					}
				if ((value !== undefined) && (value !== null) && (value.flOdbScript === true)) { //a macro table in scope holds the script
					environment.trace.push ({verb: theNode.fn.name, args, flOdbScript: true});
					return (callOdbScript (value, args, theNode.fn.name, argNames));
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
					return (callHandler (value, args, argNames));
					}
				if ((value !== undefined) && (value.flOdbScript === true)) {
					environment.trace.push ({verb: dottedName, args, flOdbScript: true});
					return (callOdbScript (value, args, dottedName, argNames));
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
					return (callOdbScript (external, args, dottedName, argNames));
					}
				}
			const message = "Can't call " + dottedName + " because it isn't a verb, a handler or a script.";
			throw new Error (message);
			}
		
		//calling through a computed value
		const fn = evalExpr (theNode.fn);
		if ((fn !== undefined) && (fn.flHandler === true)) {
			return (callHandler (fn, args, argNames));
			}
		if ((fn !== undefined) && (fn !== null) && (fn.flOdbScript === true)) { //a script reached through an address or table walk
			environment.trace.push ({verb: pathTextForNode (theNode.fn), args, flOdbScript: true});
			return (callOdbScript (fn, args, pathTextForNode (theNode.fn), argNames));
			}
		if (typeof fn === "function") {
			environment.trace.push ({verb: pathTextForNode (theNode.fn), args});
			return (fn (args, environment));
			}
		const message = "Can't call " + pathTextForNode (theNode.fn) + " because it isn't a verb, a handler or a script.";
		throw new Error (message);
		}
	
	function callHandler (theHandler, theArgs, theArgNames) {
		
		const frame = {vars: {}, callArgs: theArgs}; //callArgs feed a kernel (x.y) thunk in the body
		
		const savedFrames = environment.frames;
		environment.frames = theHandler.closureFrames.concat ([frame]);
		
		/*  7/27/26 by CC -- split the arguments: named ones bind to the
			param with that name, the rest bind in order.  */
		const positional = [];
		const byName = {};
		theArgs.forEach (function (value, ixArg) {
			const argName = (theArgNames === undefined) ? undefined : theArgNames [ixArg];
			if (argName === undefined) {
				positional.push (value);
				}
			else {
				byName [argName.toLowerCase ()] = value;
				}
			});
		
		var ixPositional = 0;
		theHandler.params.forEach (function (param) {
			var value;
			if (byName [param.name.toLowerCase ()] !== undefined) {
				value = byName [param.name.toLowerCase ()];
				}
			else {
				if (ixPositional < positional.length) {
					value = positional [ixPositional];
					ixPositional++;
					}
				}
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
	
	function callOdbScript (theScript, theArgs, theName, theArgNames) {
		
		/*  A script value from the odb, called like a verb: parse it once,
			evaluate its module (skipping test-code bundles), then call the
			handler named for it -- Frontier's script-call semantics.  */
		
		if (theScript.parsedStatements === undefined) {
			if (environment.parseScript === undefined) {
				const message = "Can't call " + theName + " because no script parser is installed.";
				throw new Error (message);
				}
			try {
				theScript.parsedStatements = environment.parseScript (theScript.lines);
				}
			catch (err) {
				const message = "Can't call " + theName + " because its script doesn't parse: " + err.message;
				const parseError = new Error (message);
				parseError.flRethrow = true; //7/27/26 by CC -- a parse failure must surface, not read as verb-not-found
				throw parseError;
				}
			}
		
		const moduleFrame = {vars: {}};
		const savedFrames = environment.frames;
		environment.frames = [moduleFrame];
		
		try {
			/*  7/27/26 by CC -- only TRAILING bundles are the test-code
				convention; a bundle in the body of the script is working
				code and runs. manilaSuite.init is built entirely of them.  */
			var ixLastReal = -1;
			theScript.parsedStatements.forEach (function (statement, ixStatement) {
				if (statement.op !== "bundle") {
					ixLastReal = ixStatement;
					}
				});
			const statements = [];
			theScript.parsedStatements.forEach (function (statement, ixStatement) {
				if (ixStatement <= ixLastReal) {
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
			
			return (callHandler (moduleFrame.vars [handlerKey], theArgs, theArgNames));
			}
		catch (err) {
			if (err.flReturnSignal) { //a straight-code script returning at the top level
				return (err.value);
				}
			err.flRethrow = true;
			throw err;
			}
		finally {
			environment.frames = savedFrames;
			}
		}
	
	function findValueHome (theValue) {
		/*  7/28/26 by CC -- find the table that holds this exact value, for
			parentOf on a bare value. One full walk builds an identity map;
			later calls answer from it, and a miss rebuilds once, since the
			odb keeps changing.  */
		function buildIndex () {
			const map = new WeakMap ();
			const visited = new Set ();
			function walk (theTable, thePath) {
				if (visited.has (theTable)) {
					return;
					}
				visited.add (theTable);
				Object.keys (theTable).forEach (function (key) {
					const child = theTable [key];
					const childPath = (thePath === "") ? key : thePath + "." + key;
					if ((child !== null) && (typeof child === "object")) {
						if (!map.has (child)) {
							map.set (child, {container: theTable, containerPath: thePath, ownPath: childPath});
							}
						if ((child.flOdbScript === undefined) && (child.flAddress === undefined) && (!Array.isArray (child)) && (child.type === undefined)) {
							walk (child, childPath);
							}
						}
					});
				}
			walk (environment.odb, "");
			return (map);
			}
		if (environment.parentIndex === undefined) {
			environment.parentIndex = buildIndex ();
			}
		var found = environment.parentIndex.get (theValue);
		if (found === undefined) {
			environment.parentIndex = buildIndex ();
			found = environment.parentIndex.get (theValue);
			}
		return (found);
		}
	
	/*  7/28/26 by CC -- the macro processor reaches the evaluator through
		the environment: run parsed statements with extra tables in scope,
		innermost last.  */
	environment.evaluateWithScopes = function (theStatements, theScopeTables) {
		theScopeTables.forEach (function (scopeTable) {
			environment.withPaths.push (scopeTable);
			});
		environment.frames.push ({vars: {}});
		try {
			return (evaluate (theStatements, environment));
			}
		catch (signal) {
			if (signal.flReturnSignal) {
				return (signal.value);
				}
			throw signal;
			}
		finally {
			environment.frames.pop ();
			theScopeTables.forEach (function () {
				environment.withPaths.pop ();
				});
			}
		};
	
	/*  7/27/26 by CC -- the kernel's callScript reaches the evaluator
		through the environment: run a script value with args, optionally
		with a table in scope the way callScript's third parameter works.  */
	environment.callScriptValue = function (theScript, theArgs, theScopeTable) {
		if (theScopeTable !== undefined) {
			environment.withPaths.push (theScopeTable);
			}
		try {
			return (callOdbScript (theScript, theArgs, "callScript", undefined));
			}
		finally {
			if (theScopeTable !== undefined) {
				environment.withPaths.pop ();
				}
			}
		};
	
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
				if ((list !== undefined) && (list.flAddress === true)) {
					/*  7/27/26 by CC -- for adr in @table yields the ADDRESS of
						each entry, the way Frontier does: the body says adr^
						for the value and nameOf (adr^) for the entry's name.  */
					items = [];
					const table = list.reference.get ();
					sortedTableKeys (table).forEach (function (key) { //Frontier tables walk in sorted order
						items.push ({
							flAddress: true,
							pathText: list.pathText + "." + key,
							reference: {
								get: function () {
									return (table [key]);
									},
								set: function (theValue) {
									table [key] = theValue;
									},
								remove: function () {
									delete table [key];
									}
								}
							});
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
				var ixMatched = -1;
				statement.clauses.forEach (function (clause, ixClause) {
					if (ixMatched !== -1) {
						return;
						}
					const pair = coerceForCompare (value, evalExpr (clause.value));
					if (pair.left == pair.right) {
						ixMatched = ixClause;
						}
					});
				if (ixMatched === -1) {
					if (statement.elseBody !== undefined) {
						runBody (statement.elseBody);
						}
					}
				else {
					/*  7/27/26 by CC -- consecutive clause values share the body
						below them: a matched clause with an empty body runs the
						next clause's body, the way "WinNT" and "Win95" share one
						branch all over the corpus.  */
					var ixBody = ixMatched;
					while ((ixBody < statement.clauses.length) && (statement.clauses [ixBody].body.length === 0)) {
						ixBody++;
						}
					if (ixBody < statement.clauses.length) {
						runBody (statement.clauses [ixBody].body);
						}
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
