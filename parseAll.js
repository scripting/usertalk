/*  The parse-rate metric: run the UserTalk parser over all 361 build
	scripts, tally clean parses and categorized failures.

	by CC, 7/27/26 */

const fs = require ("fs");
const parse = require ("./parse.js");

const folderBuildScripts = "/Users/davewiner/Claude/daveMigrates/usertalk build scripts";
const pathReport = "/Users/davewiner/Claude/usertalk/misc/reports/parseReport.json";

function unescapeXml (theString) {
	return (theString
		.replace (/&lt;/g, "<")
		.replace (/&gt;/g, ">")
		.replace (/&quot;/g, "\"")
		.replace (/&apos;/g, "'")
		.replace (/&amp;/g, "&"));
	}

function opmlToTree (theXml) { //an array of {text, subs}, comment subtrees excluded

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

var ctClean = 0, ctFailed = 0;
const failures = [];

fs.readdirSync (folderBuildScripts).forEach (function (fname) {
	if (!fname.endsWith (".opml")) {
		return;
		}
	const theXml = fs.readFileSync (folderBuildScripts + "/" + fname, "latin1");
	const theTree = opmlToTree (theXml);
	try {
		parse.parseOutline (theTree);
		ctClean++;
		}
	catch (err) {
		ctFailed++;
		failures.push ({script: fname, message: err.message});
		}
	});

const categories = {};
failures.forEach (function (failure) {
	const key = failure.message.replace (/"[^"]*"/g, "\"...\""); //group by message shape
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
