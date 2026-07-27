/*  Stage the interpreter's sandbox: the belter files rendered from the
	ODB become the nodeeditor source folder buildBelter copies from --
	the same chain Frontier runs: outline -> files -> build script.

	by CC, 7/27/26 */

const fs = require ("fs");
const path = require ("path");

const folderRendered = "/Users/davewiner/Claude/usertalk/misc/research/sandbox/render/belter";
const folderSource = "/Users/davewiner/Claude/usertalk/misc/sandbox/usertalk/nodeeditor/scripting.com-code-belter";

function copyTree (fromFolder, toFolder) {
	fs.mkdirSync (toFolder, {recursive: true});
	fs.readdirSync (fromFolder).forEach (function (fname) {
		const fromPath = path.join (fromFolder, fname);
		const toPath = path.join (toFolder, fname);
		if (fs.statSync (fromPath).isDirectory ()) {
			copyTree (fromPath, toPath);
			}
		else {
			fs.copyFileSync (fromPath, toPath);
			}
		});
	}

copyTree (folderRendered, folderSource);
console.log ("staged " + folderSource);
