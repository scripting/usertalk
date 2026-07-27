//Print the first few failing LINES per failure shape, with their text. by CC, 7/27/26

const fs = require ("fs");
const parse = require ("./parse.js");

const folderBuildScripts = "/Users/davewiner/Claude/daveMigrates/usertalk build scripts";

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

const seen = {};

fs.readdirSync (folderBuildScripts).forEach (function (fname) {
	if (!fname.endsWith (".opml")) {
		return;
		}
	const theXml = fs.readFileSync (folderBuildScripts + "/" + fname, "latin1");
	const theTree = opmlToTree (theXml);
	
	function walk (nodes) {
		nodes.forEach (function (node) {
			try {
				parse.parseLine (node.text);
				}
			catch (err) {
				const key = err.message.replace (/"[^"]*"/g, "\"...\"");
				if (seen [key] === undefined) {
					seen [key] = 0;
					}
				if (seen [key] < 4) {
					console.log ("[" + fname + "] " + err.message);
					console.log ("    LINE: " + node.text);
					}
				seen [key]++;
				}
			walk (node.subs);
			});
		}
	walk (theTree);
	});

console.log ("");
Object.keys (seen).forEach (function (key) {
	console.log (seen [key] + "x " + key);
	});
