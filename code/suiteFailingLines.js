//Show the exact failing line texts in the six failing suite scripts. by CC, 7/27/26

const fs = require ("fs");
const parse = require ("./parse.js");

const theSuite = JSON.parse (fs.readFileSync ("/Users/davewiner/Claude/daveMigrates/misc/nodeEditor.json", "utf8"));

function getAddress (theTable, thePath) {
	var current = theTable;
	thePath.split (".").forEach (function (part) {
		if ((current !== undefined) && (current.type === "table")) {
			current = current.value;
			}
		if (current !== undefined) {
			current = current [part];
			}
		});
	return (current);
	}

const scripts = [
	"nodeEditorSuite.chatgpt.letsWatchThatStinkingFolderx",
	"nodeEditorSuite.imageBrowser.everyNight",
	"nodeEditorSuite.utilities.nightlyGithubUpload",
	"nodeEditorSuite.utilities.nightlyRootsBackup",
	"nodeEditorSuite.utilities.testXmlRpcMailService"
	];

scripts.forEach (function (thePath) {
	const theScript = getAddress (theSuite, thePath);
	theScript.lines.forEach (function (line, ix) {
		if (line.flComment) {
			return;
			}
		try {
			parse.parseLine (line.text);
			}
		catch (err) {
			console.log (thePath + " line " + ix + ": " + JSON.stringify (line.text));
			console.log ("    " + err.message);
			}
		});
	});
