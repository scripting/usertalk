/*  Parse UserTalk into an AST. The grammar is langparser.y from the
	Frontier kernel; the input is outline-structured code -- each line is
	one statement or block header, its children are its block. There are
	no braces.
	
	Precedence, from the yacc declarations, loosest first:
	, then = (assign) then or then and then == != then < > <= >=
	beginswith endswith contains then + - then * / mod then not then
	++ -- unary-minus @ then ^ then .
	
	by CC, 7/27/26 */

const keywords = [
	"if", "else", "loop", "fileloop", "in", "break", "return", "bundle",
	"local", "global", "on", "while", "case", "kernel", "for", "to",
	"downto", "continue", "with", "try", "and", "or", "not",
	"beginswith", "endswith", "contains", "mod"
	];

function tokenize (theText) {
	
	const tokens = [];
	var ix = 0;
	
	function error (message) {
		throw new Error ("Can't tokenize the line because " + message);
		}
	
	while (ix < theText.length) {
		
		const ch = theText.charAt (ix);
		
		if ((ch === " ") || (ch === "\t")) {
			ix++;
			continue;
			}
		
		if (ch === "«") { //left chevron, comment to matching right chevron or end of line
			const ixEnd = theText.indexOf ("»", ix); //right chevron
			if (ixEnd === -1) {
				break;
				}
			ix = ixEnd + 1;
			continue;
			}
		
		if ((ch === "/") && (theText.charAt (ix + 1) === "/")) { //line comment, rest of line
			break;
			}
		
		if ((ch === "\"") || (ch === "'")) {
			var literal = "";
			ix++;
			while (ix < theText.length) {
				const chString = theText.charAt (ix);
				if (chString === ch) {
					break;
					}
				if (chString === "\\") {
					ix++;
					const chEscaped = theText.charAt (ix);
					switch (chEscaped) {
						case "n":
							literal += "\n";
							break;
						case "r":
							literal += "\r";
							break;
						case "t":
							literal += "\t";
							break;
						default:
							literal += chEscaped;
							break;
						}
					}
				else {
					literal += chString;
					}
				ix++;
				}
			if (ix >= theText.length) {
				error ("a string that starts with " + ch + " never closes.");
				}
			ix++;
			tokens.push ({type: "string", value: literal});
			continue;
			}
		
		if ((ch >= "0") && (ch <= "9")) {
			var number = "";
			while ((ix < theText.length) && (/[0-9.xXa-fA-F]/.test (theText.charAt (ix)))) {
				if ((theText.charAt (ix) === ".") && !(/[0-9]/.test (theText.charAt (ix + 1)))) {
					break; //a dot not followed by a digit belongs to a path, not this number
					}
				number += theText.charAt (ix);
				ix++;
				}
			tokens.push ({type: "number", value: Number (number)});
			continue;
			}
		
		if (/[A-Za-z_]/.test (ch)) {
			var word = "";
			while ((ix < theText.length) && (/[A-Za-z0-9_]/.test (theText.charAt (ix)))) {
				word += theText.charAt (ix);
				ix++;
				}
			const lower = word.toLowerCase ();
			if (keywords.indexOf (lower) !== -1) {
				tokens.push ({type: lower, word});
				}
			else {
				if (lower === "true") {
					tokens.push ({type: "boolean", value: true});
					}
				else {
					if (lower === "false") {
						tokens.push ({type: "boolean", value: false});
						}
					else {
						if (lower === "infinity") {
							tokens.push ({type: "number", value: Infinity});
							}
						else {
							tokens.push ({type: "id", name: word});
							}
						}
					}
				}
			continue;
			}
		
		function take (theOperator, theType) {
			if (theText.slice (ix, ix + theOperator.length) === theOperator) {
				tokens.push ({type: theType});
				ix += theOperator.length;
				return (true);
				}
			return (false);
			}
		
		if (take ("==", "eq") || take ("!=", "ne") || take ("<=", "le") || take (">=", "ge") ||
			take ("&&", "and") || take ("||", "or") || take ("++", "plusplus") || take ("--", "minusminus") ||
			take ("≠", "ne") || take ("≤", "le") || take ("≥", "ge") || //not-equal, less-or-equal, greater-or-equal signs
			take ("=", "assign") || take ("<", "lt") || take (">", "gt") ||
			take ("+", "add") || take ("-", "subtract") || take ("*", "multiply") ||
			take ("/", "divide") || take ("%", "mod") || take ("!", "not") ||
			take ("@", "at") || take ("^", "deref") || take (".", "dot") ||
			take (",", "comma") || take ("(", "lparen") || take (")", "rparen") ||
			take ("[", "lbracket") || take ("]", "rbracket") ||
			take ("{", "lbrace") || take ("}", "rbrace") || take (";", "semicolon") ||
			take (":", "colon")) {
			continue;
			}
		
		error ("the character \"" + ch + "\" isn't part of the language.");
		}
	
	tokens.push ({type: "eol"});
	return (tokens);
	}

function parseLine (theText) {
	
	/*  Parse one line into a statement node. Block statements get their
		bodies attached later, from the outline structure.  */
	
	const tokens = tokenize (theText);
	var ixToken = 0;
	
	function peek () {
		return (tokens [ixToken]);
		}
	
	function next () {
		const token = tokens [ixToken];
		ixToken++;
		return (token);
		}
	
	function expect (theType, theContext) {
		const token = next ();
		if (token.type !== theType) {
			throw new Error ("Can't parse the line because " + theContext + " expected " + theType + " but got " + token.type + ".");
			}
		return (token);
		}
	
	function flAtEnd () {
		return (peek ().type === "eol");
		}
	
	//expressions, precedence climbing per the yacc declarations
	
	function parsePrimary () {
		
		const token = next ();
		
		switch (token.type) {
			case "string":
				return ({op: "const", value: token.value});
			case "number":
				return ({op: "const", value: token.value});
			case "boolean":
				return ({op: "const", value: token.value});
			case "id":
				return ({op: "id", name: token.name});
			case "lparen": {
				const inner = parseExpr ();
				expect ("rparen", "a parenthesized expression");
				return (inner);
				}
			case "lbracket": { //a computed identifier: [server].mail.send, @[path + name]
				const nameExpr = parseExpr ();
				expect ("rbracket", "a computed identifier");
				return ({op: "computedid", expr: nameExpr});
				}
			case "lbrace": { //a list literal
				const items = [];
				if (peek ().type !== "rbrace") {
					items.push (parseExpr ());
					while (peek ().type === "comma") {
						next ();
						items.push (parseExpr ());
						}
					}
				expect ("rbrace", "a list literal");
				return ({op: "list", items});
				}
			case "at":
				return ({op: "address", expr: parseUnary ()});
			case "not":
				return ({op: "not", expr: parseUnary ()});
			case "subtract":
				return ({op: "negate", expr: parseUnary ()});
			case "plusplus":
				return ({op: "preincrement", expr: parseUnary ()});
			case "minusminus":
				return ({op: "predecrement", expr: parseUnary ()});
			default:
				throw new Error ("Can't parse the line because an expression can't start with " + token.type + ".");
			}
		}
	
	function parsePostfix () {
		var node = parsePrimary ();
		while (true) {
			const token = peek ();
			if (token.type === "dot") {
				next ();
				if (peek ().type === "lbracket") { //computed member: adrtable^.[fname]
					next ();
					const memberExpr = parseExpr ();
					expect ("rbracket", "a computed member");
					node = {op: "index", left: node, index: memberExpr};
					continue;
					}
				const idToken = next ();
				if ((idToken.type !== "id") && (keywords.indexOf (idToken.type) === -1)) {
					throw new Error ("Can't parse the line because a dot must be followed by a name, not " + idToken.type + ".");
					}
				var name = idToken.name;
				if (name === undefined) {
					name = idToken.word; //a keyword used as a table entry name, legal after a dot
					}
				node = {op: "dot", left: node, name};
				continue;
				}
			if (token.type === "lbracket") {
				next ();
				const index = parseExpr ();
				expect ("rbracket", "a subscript");
				node = {op: "index", left: node, index};
				continue;
				}
			if (token.type === "lparen") {
				next ();
				const args = [];
				if (peek ().type !== "rparen") {
					args.push (parseCallArg ());
					while (peek ().type === "comma") {
						next ();
						args.push (parseCallArg ());
						}
					}
				expect ("rparen", "a call's arguments");
				node = {op: "call", fn: node, args};
				continue;
				}
			if (token.type === "deref") {
				next ();
				node = {op: "deref", expr: node};
				continue;
				}
			if (token.type === "plusplus") {
				next ();
				node = {op: "postincrement", expr: node};
				continue;
				}
			if (token.type === "minusminus") {
				next ();
				node = {op: "postdecrement", expr: node};
				continue;
				}
			break;
			}
		return (node);
		}
	
	function parseCallArg () { //an argument may be named: flatfilenames: true
		if ((peek ().type === "id") && (tokens [ixToken + 1] !== undefined) && (tokens [ixToken + 1].type === "colon")) {
			const nameToken = next ();
			next ();
			return ({op: "namedarg", name: nameToken.name, value: parseExpr ()});
			}
		return (parseExpr ());
		}
	
	function parseUnary () {
		return (parsePostfix ());
		}
	
	const binaryLevels = [ //loosest first; assign handled at statement level
		["or"],
		["and"],
		["eq", "ne"],
		["lt", "gt", "le", "ge", "beginswith", "endswith", "contains"],
		["add", "subtract"],
		["multiply", "divide", "mod"]
		];
	
	function parseBinary (level) {
		if (level >= binaryLevels.length) {
			return (parseUnary ());
			}
		var node = parseBinary (level + 1);
		while (binaryLevels [level].indexOf (peek ().type) !== -1) {
			const operator = next ().type;
			const right = parseBinary (level + 1);
			node = {op: operator, left: node, right};
			}
		return (node);
		}
	
	function parseExpr () {
		return (parseBinary (0));
		}
	
	function parseNameList () { //for local (...) and handler parameters: name, or name = default
		const inits = [];
		if ((peek ().type !== "rparen") && (peek ().type !== "rbrace")) {
			while (true) {
				const nameToken = expect ("id", "a name list");
				var value;
				if (peek ().type === "assign") {
					next ();
					value = parseExpr ();
					}
				inits.push ({name: nameToken.name, value});
				if (peek ().type === "comma") {
					next ();
					continue;
					}
				break;
				}
			}
		return (inits);
		}
	
	function parseSimpleStatement () { //an expression or an assignment, no keyword forms
		const expr = parseExpr ();
		if (peek ().type === "assign") {
			next ();
			const value = parseExpr ();
			return ({op: "assign", target: expr, value});
			}
		return ({op: "expression", expr});
		}
	
	function parseStatement () {
		
		const token = peek ();
		
		switch (token.type) {
			
			case "eol":
				return ({op: "noop"});
			
			case "on": {
				next ();
				const nameToken = expect ("id", "a handler definition");
				expect ("lparen", "a handler definition");
				const params = parseNameList ();
				expect ("rparen", "a handler definition");
				return ({op: "handler", name: nameToken.name, params, body: []});
				}
			
			case "local": case "global": {
				const which = next ().type;
				var inits = [];
				if (peek ().type === "lparen") {
					next ();
					inits = parseNameList ();
					expect ("rparen", "a " + which + " declaration");
					}
				else {
					if (peek ().type === "lbrace") {
						next ();
						inits = parseNameList ();
						expect ("rbrace", "a " + which + " declaration");
						}
					else {
						inits = parseNameList (); //bare form: local name = value
						}
					}
				return ({op: which, inits});
				}
			
			case "if": {
				next ();
				const test = parseExpr ();
				return ({op: "if", test, body: [], elseBody: undefined});
				}
			
			case "else":
				next ();
				if (peek ().type === "if") { //else if, cascaded
					const nested = parseStatement ();
					return ({op: "else", nestedIf: nested, body: []});
					}
				return ({op: "else", body: []});
			
			case "loop": {
				next ();
				if (peek ().type === "lparen") {
					next ();
					const first = parseSimpleStatement ();
					if (peek ().type === "semicolon") { //loop (init; test; step)
						next ();
						const test = parseExpr ();
						expect ("semicolon", "a three-part loop header");
						const step = parseSimpleStatement ();
						expect ("rparen", "a three-part loop header");
						return ({op: "loop3", init: first, test, step, body: []});
						}
					expect ("rparen", "a loop header");
					if (first.op !== "expression") {
						throw new Error ("Can't parse the line because a counted loop header needs an expression.");
						}
					return ({op: "loop", count: first.expr, body: []});
					}
				return ({op: "loop", body: []});
				}
			
			case "while": {
				next ();
				const test = parseExpr ();
				return ({op: "while", test, body: []});
				}
			
			case "fileloop": {
				next ();
				expect ("lparen", "a fileloop header");
				const nameToken = expect ("id", "a fileloop header");
				expect ("in", "a fileloop header");
				const folder = parseExpr ();
				var depth;
				if (peek ().type === "comma") {
					next ();
					depth = parseExpr ();
					}
				expect ("rparen", "a fileloop header");
				return ({op: "fileloop", name: nameToken.name, folder, depth, body: []});
				}
			
			case "for": {
				next ();
				var flParen = false;
				if (peek ().type === "lparen") { //optional parens: for (x in y)
					next ();
					flParen = true;
					}
				const nameToken = expect ("id", "a for header");
				if (peek ().type === "in") {
					next ();
					const list = parseExpr ();
					if (flParen) {
						expect ("rparen", "a for header");
						}
					return ({op: "forin", name: nameToken.name, list, body: []});
					}
				expect ("assign", "a for header");
				const from = parseExpr ();
				const directionToken = next ();
				if ((directionToken.type !== "to") && (directionToken.type !== "downto")) {
					throw new Error ("Can't parse the line because a for header expected to or downto, not " + directionToken.type + ".");
					}
				const limit = parseExpr ();
				if (flParen) {
					expect ("rparen", "a for header");
					}
				return ({op: "for", name: nameToken.name, from, limit, flDown: directionToken.type === "downto", body: []});
				}
			
			case "bundle":
				next ();
				return ({op: "bundle", body: []});
			
			case "with": {
				next ();
				const path = parseExpr ();
				return ({op: "with", path, body: []});
				}
			
			case "try":
				next ();
				if (peek ().type === "lbrace") { //inline form: try {statement}
					next ();
					const inner = parseSimpleStatement ();
					expect ("rbrace", "an inline try");
					return ({op: "try", body: [inner], elseBody: undefined});
					}
				return ({op: "try", body: [], elseBody: undefined});
			
			case "case": {
				next ();
				const value = parseExpr ();
				return ({op: "case", value, body: []});
				}
			
			case "break":
				next ();
				if (peek ().type === "lparen") {
					next ();
					expect ("rparen", "a break statement");
					}
				return ({op: "break"});
			
			case "continue":
				next ();
				return ({op: "continue"});
			
			case "return": {
				next ();
				var value;
				if (!flAtEnd () && (peek ().type !== "semicolon")) {
					value = parseExpr ();
					}
				return ({op: "return", value});
				}
			
			default: {
				const expr = parseExpr ();
				if (peek ().type === "assign") {
					next ();
					const value = parseExpr ();
					return ({op: "assign", target: expr, value});
					}
				return ({op: "expression", expr});
				}
			}
		}
	
	const statements = [];
	statements.push (parseStatement ());
	while (peek ().type === "semicolon") { //semicolons separate statements on one line, and trail legally
		next ();
		if (!flAtEnd ()) {
			statements.push (parseStatement ());
			}
		}
	if (!flAtEnd ()) {
		throw new Error ("Can't parse the line because there are extra tokens after the statement, starting with " + peek ().type + ".");
		}
	if (statements.length === 1) {
		return (statements [0]);
		}
	return ({op: "sequence", statements});
	}

const blockOps = ["handler", "if", "else", "loop", "while", "fileloop", "for", "forin", "bundle", "with", "try", "case"];

function parseOutline (theNodes) {
	
	/*  theNodes is an array of {text, subs} outline nodes. Returns an
		array of statements, children attached as bodies, else-lines
		joined to their if or try.  */
	
	const statements = [];
	
	theNodes.forEach (function (node) {
		
		if ((node.text.trim ().length === 0) && (node.subs.length > 0)) { //a blank organizer line -- its children run at this level
			parseOutline (node.subs).forEach (function (child) {
				statements.push (child);
				});
			return;
			}
		
		const statement = parseLine (node.text);
		
		if (statement.op === "case") { //children are clauses: a value line whose children are its body, or an else line
			statement.clauses = [];
			node.subs.forEach (function (clauseNode) {
				const clauseLine = parseLine (clauseNode.text);
				if (clauseLine.op === "else") {
					statement.elseBody = parseOutline (clauseNode.subs);
					return;
					}
				if (clauseLine.op !== "expression") {
					throw new Error ("Can't parse the outline because the case clause \"" + clauseNode.text + "\" isn't a value.");
					}
				statement.clauses.push ({value: clauseLine.expr, body: parseOutline (clauseNode.subs)});
				});
			statements.push (statement);
			return;
			}
		
		if (node.subs.length > 0) {
			if (blockOps.indexOf (statement.op) === -1) {
				/*  a plain line with children -- Frontier treats subordinate
					lines of a non-block statement as part of no block; in
					Dave's corpus this shape is a continuation comment holder,
					so children must be empty of code. Refuse loudly.  */
				throw new Error ("Can't parse the outline because the line \"" + node.text + "\" isn't a block header but has sublines.");
				}
			if ((statement.op === "else") && (statement.nestedIf !== undefined)) {
				statement.nestedIf.body = parseOutline (node.subs);
				}
			else {
				statement.body = parseOutline (node.subs);
				}
			}
		
		if ((statement.op === "else") && (statements.length > 0)) {
			const previous = statements [statements.length - 1];
			if ((previous.op === "if") || (previous.op === "try") || (previous.op === "case")) {
				if (statement.nestedIf !== undefined) {
					previous.elseBody = [statement.nestedIf];
					}
				else {
					previous.elseBody = statement.body;
					}
				return;
				}
			throw new Error ("Can't parse the outline because an else line doesn't follow an if, try or case.");
			}
		
		statements.push (statement);
		});
	
	return (statements);
	}

function linesToTree (theLines) { //flat {level, text, flComment} lines to {text, subs}, comment subtrees excluded
	const root = {text: "", subs: []};
	const stack = [root];
	var depthSkip = -1;
	theLines.forEach (function (line) {
		if ((depthSkip >= 0) && (line.level > depthSkip)) {
			return;
			}
		depthSkip = -1;
		if (line.flComment) {
			depthSkip = line.level;
			return;
			}
		const node = {text: line.text, subs: []};
		stack [line.level].subs.push (node);
		stack [line.level + 1] = node;
		stack.length = line.level + 2;
		});
	return (root.subs);
	}

exports.parseLine = parseLine;
exports.parseOutline = parseOutline;
exports.tokenize = tokenize;
exports.linesToTree = linesToTree;
