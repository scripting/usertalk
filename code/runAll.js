/*  Execute all 361 build scripts under the interpreter in dry-run mode:
	file verbs answer without touching disk, so what's being measured is
	the language -- does every script RUN, not just parse.

	by CC, 7/27/26 */

const fs = require ("fs");
const parse = require ("./parse.js");
const evaluate = require ("./evaluate.js");
const verbsMaker = require ("./verbs.js");

const folderBuildScripts = "/Users/davewiner/Claude/daveMigrates/usertalk build scripts";
const pathPathMap = "/Users/davewiner/Claude/usertalk/code/pathmap.json";
const pathReport = "/Users/davewiner/Claude/usertalk/misc/reports/runAllReport.json";

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

const odbLoader = require ("./odbLoader.js");

const thePathMap = JSON.parse (fs.readFileSync (pathPathMap, "utf8"));

console.log ("loading the real odb...");
const theRealOdb = odbLoader.loadOdb (); //shared across runs -- dry mode, crosstalk acceptable for the metric
theRealOdb.user.prefs.githubfolder = thePathMap.prefs.githubfolder;
theRealOdb.user.prefs.dropboxfolder = thePathMap.prefs.dropboxfolder;
console.log ("odb loaded");

function makeDryVerbs (theTrace) {

	const made = verbsMaker.makeVerbs (thePathMap, theTrace);
	const verbs = made.verbs;

	//file verbs answer plausibly without disk

	verbs ["file.copy"] = function (args) {
		return (true);
		};
	verbs ["file.surefilepath"] = function (args) {
		return (true);
		};
	verbs ["file.surefolder"] = function (args) {
		return (true);
		};
	verbs ["file.exists"] = function (args) {
		return (true);
		};
	verbs ["file.isfolder"] = function (args) {
		return (String (args [0]).endsWith (":"));
		};
	verbs ["file.readwholefile"] = function (args) {
		return ("dry run contents of " + args [0]);
		};
	verbs ["file.writewholefile"] = function (args) {
		return (true);
		};
	verbs ["file.delete"] = function (args) {
		return (true);
		};
	verbs ["file.modified"] = function (args) {
		return (new Date (0));
		};
	verbs ["fileloop.list"] = function (args) { //two pretend files so loop bodies execute
		var base = String (args [0]);
		if (!base.endsWith (":")) {
			base += ":";
			}
		return ([base + "dryRunFileOne.txt", base + "dryRunFileTwo.txt"]);
		};
	verbs ["tcp.httpreadurl"] = function (args) {
		return ("");
		};
	verbs ["file.rename"] = function (args) {
		return (true);
		};

	return (verbs);
	}

const externalScriptCache = {};

function resolveExternalScript (theName) { //a sibling build script called by bare name
	const lower = theName.toLowerCase ();
	if (externalScriptCache [lower] !== undefined) {
		return (externalScriptCache [lower]);
		}
	var found;
	fs.readdirSync (folderBuildScripts).forEach (function (fname) {
		if (fname.toLowerCase () === lower + ".opml") {
			found = fname;
			}
		});
	if (found === undefined) {
		return (undefined);
		}
	const theXml = fs.readFileSync (folderBuildScripts + "/" + found, "latin1");
	const external = {flOdbScript: true, parsedStatements: parse.parseOutline (opmlToTree (theXml))};
	externalScriptCache [lower] = external;
	return (external);
	}

var ctOk = 0, ctFailed = 0;
const failures = [];

fs.readdirSync (folderBuildScripts).forEach (function (fname) {
	if (!fname.endsWith (".opml")) {
		return;
		}

	const theXml = fs.readFileSync (folderBuildScripts + "/" + fname, "latin1");
	const theStatements = parse.parseOutline (opmlToTree (theXml));

	const theTrace = [];
	const verbs = makeDryVerbs (theTrace);

	const environment = evaluate.makeEnvironment (theRealOdb, verbs, theTrace);
	environment.parseScript = function (theLines) {
		return (parse.parseOutline (parse.linesToTree (theLines)));
		};
	environment.resolveExternalScript = resolveExternalScript;
	environment.frames.push ({vars: {}});

	try {
		evaluate.evaluate (theStatements, environment);
		if (theTrace.length === 0) {
			const handlerName = fname.replace (/\.opml$/, "");
			const handlerKey = evaluate.findKey (environment.frames [0].vars, handlerName);
			if (handlerKey !== undefined) {
				evaluate.evaluate ([{op: "expression", expr: {op: "call", fn: {op: "id", name: handlerKey}, args: []}}], environment);
				}
			}
		ctOk++;
		}
	catch (err) {
		ctFailed++;
		failures.push ({script: fname, message: err.message, ctCallsBeforeFailure: theTrace.length});
		}
	});

const categories = {};
failures.forEach (function (failure) {
	const key = failure.message.replace (/"[^"]*"/g, "\"...\"").replace (/ of [A-Za-z0-9_.]+ /, " of ... ").replace (/call [A-Za-z0-9_.]+ /, "call ... ");
	if (categories [key] === undefined) {
		categories [key] = [];
		}
	categories [key].push (failure.script);
	});

fs.writeFileSync (pathReport, JSON.stringify ({ctOk, ctFailed, categories, failures}, undefined, "\t"));

console.log ("ran clean: " + ctOk + " of " + (ctOk + ctFailed));
Object.keys (categories).forEach (function (key) {
	console.log ("[" + categories [key].length + "] " + key + " -- e.g. " + categories [key] [0]);
	});
