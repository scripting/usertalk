/*  Run one UserTalk script outline under the interpreter.
	
	node run.js path/to/script.opml [--trace] [--odb folder]
	node run.js buildBelter.opml [--trace]
	
	A path that exists is run as given; a bare name is looked up in the
	build-scripts folder. Binds user.prefs from the path map, runs the
	top-level handler, prints every verb call.
	
	With --odb, the object database is assembled from the folder by
	odbHome.js -- drop .root files, fat pages and subfolders in the
	folder and they become the namespace the script runs in.
	
	by CC, 7/27/26 */

const fs = require ("fs");
const parse = require ("./parse.js");
const evaluate = require ("./evaluate.js");
const verbsMaker = require ("./verbs.js");
const odbHome = require ("./odbHome.js");

const folderBuildScripts = "/Users/davewiner/Claude/daveMigrates/usertalk build scripts";
const pathPathMap = require ("path").join (__dirname, "pathmap.json"); //7/27/26 by CC -- next to the code, wherever the repo lives

const scriptName = process.argv [2];
const flTrace = process.argv.indexOf ("--trace") !== -1;

var folderOdbHome; //7/27/26 by CC -- set by --odb
const ixOdbFlag = process.argv.indexOf ("--odb");
if (ixOdbFlag !== -1) {
	folderOdbHome = process.argv [ixOdbFlag + 1];
	if (folderOdbHome === undefined) {
		console.log ("Can't load the odb because --odb needs a folder path after it.");
		process.exit (1);
		}
	}

if (scriptName === undefined) {
	console.log ("usage: node run.js buildBelter.opml [--trace] [--odb folder]");
	process.exit (1);
	}

function unescapeXml (theString) {
	return (theString
		.replace (/&lt;/g, "<")
		.replace (/&gt;/g, ">")
		.replace (/&quot;/g, "\"")
		.replace (/&apos;/g, "'")
		.replace (/&amp;/g, "&"));
	}

function opmlToTree (theXml) {
	const root = {text: "", subs: []};
	const stack = [root];
	var depthSkip = -1;
	var depth = 0;
	const tagPattern = /<outline\b([^>]*?)(\/?)>|<\/outline>/g;
	var match;
	while ((match = tagPattern.exec (theXml)) !== null) {
		if (match [0] === "</outline>") {
			depth--;
			if ((depthSkip >= 0) && (depth <= depthSkip)) {
				depthSkip = -1;
				}
			stack.length = depth + 1;
			}
		else {
			const attributes = match [1];
			const flSelfClosing = match [2] === "/";
			const flComment = /isComment="true"/.test (attributes);
			const textMatch = attributes.match (/text="([^"]*)"/);
			var text = "";
			if (textMatch !== null) {
				text = unescapeXml (textMatch [1]);
				}
			if (depthSkip === -1) {
				if (flComment) {
					if (!flSelfClosing) {
						depthSkip = depth;
						}
					}
				else {
					const node = {text, subs: []};
					stack [depth].subs.push (node);
					if (!flSelfClosing) {
						stack [depth + 1] = node;
						}
					}
				}
			if (!flSelfClosing) {
				depth++;
				}
			}
		}
	return (root.subs);
	}

const thePathMap = JSON.parse (fs.readFileSync (pathPathMap, "utf8"));
var pathScript = scriptName; //7/27/26 by CC -- a path that exists runs as given, a bare name comes from the build-scripts folder
if (!fs.existsSync (pathScript)) {
	pathScript = folderBuildScripts + "/" + scriptName;
	}
const theXml = fs.readFileSync (pathScript, "latin1");
const theStatements = parse.parseOutline (opmlToTree (theXml));

const theTrace = [];
const made = verbsMaker.makeVerbs (thePathMap, theTrace);

var theOdb;
if (folderOdbHome === undefined) {
	theOdb = {
		user: {
			prefs: thePathMap.prefs
			},
		scratchpad: {},
		config: {},
		system: {}
		};
	}
else {
	theOdb = odbHome.loadFolder (folderOdbHome, function (message) {
		console.log ("odbHome: " + message);
		});
	if (theOdb.user.prefs === undefined) { //the path map's prefs are this machine's values -- they win
		theOdb.user.prefs = {};
		}
	Object.keys (thePathMap.prefs).forEach (function (name) {
		theOdb.user.prefs [name] = thePathMap.prefs [name];
		});
	}

const environment = evaluate.makeEnvironment (theOdb, made.verbs, theTrace);
environment.parseScript = function (theLines) { //7/27/26 by CC -- scripts loaded from the odb parse on first call
	return (parse.parseOutline (parse.linesToTree (theLines)));
	};

/*  Run the module the way Frontier runs a script: the top level binds
	the handlers, and the trailing bundle -- Frontier's test-code
	convention -- calls them. Only if the module made no verb calls do
	we call the handler named for the script ourselves.  */

environment.frames.push ({vars: {}});

var flFailed = false;
try {
	evaluate.evaluate (theStatements, environment);
	
	if (theTrace.length === 0) {
		const handlerName = pathScript.split ("/").pop ().replace (/\.opml$/, ""); //7/27/26 by CC -- the script's own name, wherever it lives
		const handlerKey = evaluate.findKey (environment.frames [0].vars, handlerName);
		if (handlerKey !== undefined) {
			evaluate.evaluate ([{op: "expression", expr: {op: "call", fn: {op: "id", name: handlerKey}, args: []}}], environment);
			}
		}
	}
catch (err) {
	flFailed = true;
	console.log ("FAILED: " + err.message);
	}

if (flTrace || flFailed) {
	theTrace.forEach (function (entry) {
		var argsText = "";
		entry.args.forEach (function (arg) {
			if (argsText.length > 0) {
				argsText += ", ";
				}
			if (typeof arg === "string") {
				argsText += "\"" + arg + "\"";
				}
			else {
				argsText += String (arg);
				}
			});
		console.log (entry.verb + " (" + argsText + ")");
		});
	}

console.log (scriptName + ": " + theTrace.length + " verb calls" + (flFailed ? " (FAILED)" : " (ok)"));
