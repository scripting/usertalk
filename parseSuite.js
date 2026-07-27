/*  Parse every script in the nodeEditor suite -- the 838 scripts the
	build scripts call into -- as a harder test of the parser.

	by CC, 7/27/26 */

const fs = require ("fs");
const parse = require ("./parse.js");

const pathSuite = "/Users/davewiner/Claude/daveMigrates/misc/nodeEditor.json";
const pathReport = "/Users/davewiner/Claude/usertalk/misc/reports/parseSuiteReport.json";

function linesToTree (theLines) { //flat {level, text, flComment} lines to {text, subs}, comments excluded
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

function walkTableForScripts (theTable, thePath, visit) {
	Object.keys (theTable).forEach (function (name) {
		const value = theTable [name];
		if ((typeof value === "object") && (value !== null)) {
			if (value.type === "table") {
				walkTableForScripts (value.value, thePath + name + ".", visit);
				}
			else {
				if ((value.type === "script") && (value.lines !== undefined)) {
					visit (thePath + name, value.lines);
					}
				}
			}
		});
	}

var ctClean = 0, ctFailed = 0;
const failures = [];

const theSuite = JSON.parse (fs.readFileSync (pathSuite, "utf8"));
walkTableForScripts (theSuite, "", function (thePath, theLines) {
	try {
		parse.parseOutline (linesToTree (theLines));
		ctClean++;
		}
	catch (err) {
		ctFailed++;
		failures.push ({script: thePath, message: err.message});
		}
	});

const categories = {};
failures.forEach (function (failure) {
	const key = failure.message.replace (/"[^"]*"/g, "\"...\"");
	if (categories [key] === undefined) {
		categories [key] = [];
		}
	categories [key].push (failure.script);
	});

fs.writeFileSync (pathReport, JSON.stringify ({ctClean, ctFailed, categories, failures}, undefined, "\t"));

console.log ("clean: " + ctClean + " of " + (ctClean + ctFailed));
Object.keys (categories).forEach (function (key) {
	console.log ("[" + categories [key].length + "] " + key + " -- e.g. " + categories [key] [0]);
	});
