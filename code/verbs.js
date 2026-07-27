/*  The verb library for the UserTalk interpreter prototype: real file
	verbs over Node fs behind a Mac-colon-path map, the string and clock
	verbs the build scripts use, and loud trace-only stubs for the rest.

	Unimplemented verbs fail loudly -- nothing silently succeeds.

	by CC, 7/27/26 */

const fs = require ("fs");
const path = require ("path");

function makeVerbs (thePathMap, theTrace) {

	function macToReal (theColonPath) {
		var found, foundReal;
		Object.keys (thePathMap.prefixes).forEach (function (prefix) {
			if (theColonPath.toLowerCase ().indexOf (prefix.toLowerCase ()) === 0) {
				if ((found === undefined) || (prefix.length > found.length)) {
					found = prefix;
					foundReal = thePathMap.prefixes [prefix];
					}
				}
			});
		if (found === undefined) {
			const message = "Can't map the path " + theColonPath + " because no prefix in the path map covers it.";
			throw new Error (message);
			}
		var rest = theColonPath.slice (found.length);
		if (rest.indexOf (":") === 0) {
			rest = rest.slice (1);
			}
		if (rest.endsWith (":")) {
			rest = rest.slice (0, rest.length - 1);
			}
		return (path.join (foundReal, rest.split (":").join ("/")));
		}

	const verbs = {};

	//file verbs

	verbs ["file.copy"] = function (args) {
		const source = macToReal (args [0]);
		const dest = macToReal (args [1]);
		fs.copyFileSync (source, dest);
		return (true);
		};

	verbs ["file.surefilepath"] = function (args) {
		const dest = macToReal (args [0]);
		fs.mkdirSync (path.dirname (dest), {recursive: true});
		return (true);
		};

	verbs ["file.surefolder"] = function (args) {
		fs.mkdirSync (macToReal (args [0]), {recursive: true});
		return (true);
		};

	verbs ["file.exists"] = function (args) {
		return (fs.existsSync (macToReal (args [0])));
		};

	verbs ["file.isfolder"] = function (args) {
		const thePath = macToReal (args [0]);
		if (!fs.existsSync (thePath)) {
			return (false);
			}
		return (fs.statSync (thePath).isDirectory ());
		};

	verbs ["file.readwholefile"] = function (args) {
		return (fs.readFileSync (macToReal (args [0]), "latin1"));
		};

	verbs ["file.writewholefile"] = function (args) {
		const dest = macToReal (args [0]);
		fs.mkdirSync (path.dirname (dest), {recursive: true});
		fs.writeFileSync (dest, String (args [1]), "latin1");
		return (true);
		};

	verbs ["file.delete"] = function (args) {
		const thePath = macToReal (args [0]);
		if (fs.existsSync (thePath)) {
			fs.rmSync (thePath, {recursive: true});
			}
		return (true);
		};

	verbs ["file.filefrompath"] = function (args) {
		var theColonPath = String (args [0]);
		if (theColonPath.endsWith (":")) {
			theColonPath = theColonPath.slice (0, theColonPath.length - 1);
			}
		const parts = theColonPath.split (":");
		return (parts [parts.length - 1]);
		};

	verbs ["file.folderfrompath"] = function (args) {
		var theColonPath = String (args [0]);
		if (theColonPath.endsWith (":")) {
			theColonPath = theColonPath.slice (0, theColonPath.length - 1);
			}
		const ixLast = theColonPath.lastIndexOf (":");
		return (theColonPath.slice (0, ixLast + 1));
		};

	verbs ["file.modified"] = function (args) {
		return (fs.statSync (macToReal (args [0])).mtime);
		};

	verbs ["fileloop.list"] = function (args) { //the interpreter's fileloop support: colon paths of everything in the folder
		const folderColon = String (args [0]);
		const depth = args [1];
		const folderReal = macToReal (folderColon);
		const result = [];
		function visit (realFolder, colonFolder, level) {
			fs.readdirSync (realFolder).forEach (function (fname) {
				const realChild = path.join (realFolder, fname);
				const flFolder = fs.statSync (realChild).isDirectory ();
				const colonChild = colonFolder + fname + (flFolder ? ":" : "");
				result.push (colonChild);
				if (flFolder && ((depth === Infinity) || (level < depth))) {
					visit (realChild, colonChild, level + 1);
					}
				});
			}
		var colonBase = folderColon;
		if (!colonBase.endsWith (":")) {
			colonBase += ":";
			}
		visit (folderReal, colonBase, 1);
		return (result);
		};

	//string and value verbs

	verbs ["string.replaceall"] = function (args) {
		return (String (args [0]).split (String (args [1])).join (String (args [2])));
		};

	verbs ["string.replace"] = function (args) {
		return (String (args [0]).replace (String (args [1]), String (args [2])));
		};

	verbs ["string.delete"] = function (args) { //1-based start, count
		const theString = String (args [0]);
		const ixStart = args [1] - 1;
		return (theString.slice (0, ixStart) + theString.slice (ixStart + args [2]));
		};

	verbs ["string.mid"] = function (args) { //1-based start, count
		return (String (args [0]).substr (args [1] - 1, args [2]));
		};

	verbs ["string.lower"] = function (args) {
		return (String (args [0]).toLowerCase ());
		};

	verbs ["string.upper"] = function (args) {
		return (String (args [0]).toUpperCase ());
		};

	verbs ["string.filledstring"] = function (args) {
		return (String (args [0]).repeat (args [1]));
		};

	verbs ["string.lastfield"] = function (args) {
		const parts = String (args [0]).split (String (args [1]));
		return (parts [parts.length - 1]);
		};

	verbs ["string.popsuffix"] = function (args) {
		const theString = String (args [0]);
		const ixDot = theString.lastIndexOf (".");
		if (ixDot === -1) {
			return (theString);
			}
		return (theString.slice (0, ixDot));
		};

	verbs ["string.countfields"] = function (args) {
		return (String (args [0]).split (String (args [1])).length);
		};

	verbs ["string.nthfield"] = function (args) {
		return (String (args [0]).split (String (args [1])) [args [2] - 1]);
		};

	verbs ["string"] = function (args) {
		return (String (args [0]));
		};

	verbs ["number"] = function (args) {
		return (Number (args [0]));
		};

	verbs ["sizeof"] = function (args) {
		const theValue = args [0];
		if (typeof theValue === "string") {
			return (theValue.length);
			}
		if (Array.isArray (theValue)) {
			return (theValue.length);
			}
		if ((theValue !== undefined) && (theValue !== null) && (typeof theValue === "object")) {
			return (Object.keys (theValue).length);
			}
		return (0);
		};

	verbs ["defined"] = function (args) {
		return (args [0] !== undefined);
		};

	verbs ["typeof"] = function (args) { //answers match the language constants, so case statements compare true
		const theValue = args [0];
		if (theValue === undefined) {
			return ("unknowntype");
			}
		if (typeof theValue === "string") {
			return ("stringtype");
			}
		if (typeof theValue === "number") {
			return ("numbertype");
			}
		if (typeof theValue === "boolean") {
			return ("booleantype");
			}
		if (theValue instanceof Date) {
			return ("datetype");
			}
		if (Array.isArray (theValue)) {
			return ("listtype");
			}
		if (theValue.flOdbScript === true) {
			return (theValue.scriptType === "outline" ? "outlinetype" : "scripttype");
			}
		if (theValue.flAddress === true) {
			return ("addresstype");
			}
		if (theValue.type === "binary") {
			return ("binarytype");
			}
		if (theValue.type === "wptext") {
			return ("wptexttype");
			}
		return ("tabletype");
		};

	verbs ["nameof"] = function (args) { //the last component of an address's path
		const theValue = args [0];
		if ((theValue !== undefined) && (theValue.flAddress === true)) {
			const parts = theValue.pathText.split (".");
			return (parts [parts.length - 1]);
			}
		return (String (theValue));
		};

	verbs ["msg"] = function (args) { //7/27/26 by CC -- msg speaks: Frontier showed it to the user, we print it
		console.log (String (args [0]));
		return (true);
		};

	verbs ["new"] = function (args) { //new (tabletype, @adr) -- create an empty value at the address
		const theType = args [0];
		const theAddress = args [1];
		var value = {};
		if (theType === "listtype") {
			value = [];
			}
		if (theType === "stringtype") {
			value = "";
			}
		if ((theType === "outlinetype") || (theType === "scripttype")) {
			value = {flOdbScript: true, scriptType: theType === "outlinetype" ? "outline" : "script", lines: []};
			}
		if ((theAddress === undefined) || (theAddress.flAddress !== true)) {
			const message = "Can't create the new " + theType + " because the second parameter isn't an address.";
			throw new Error (message);
			}
		theAddress.reference.set (value);
		return (true);
		};

	verbs ["edit"] = function (args) {
		return (true); //opens a window in Frontier; the trace line stands in
		};

	verbs ["date"] = function (args) {
		if (args.length === 0) {
			return (new Date ());
			}
		return (new Date (args [0]));
		};

	verbs ["clock.ticks"] = function (args) {
		return (Math.floor (Date.now () * 60 / 1000)); //Frontier ticks are 60ths of a second
		};

	verbs ["file.rename"] = function (args) {
		const from = macToReal (args [0]);
		fs.renameSync (from, path.join (path.dirname (from), String (args [1])));
		return (true);
		};

	verbs ["clock.now"] = function (args) {
		return (new Date ());
		};

	verbs ["date.netstandardstring"] = function (args) {
		return (new Date (args [0]).toUTCString ());
		};

	verbs ["speaker.beep"] = function (args) {
		return (true); //the trace line is the beep
		};

	verbs ["dialog.alert"] = function (args) {
		return (true); //the trace line is the dialog
		};

	verbs ["dialog.notify"] = verbs ["dialog.alert"];

	//stubs: recorded in the trace by the evaluator, loud about what they are

	const stubNames = [
		"nodeeditorsuite.savesourceopmltorepo", "nodeeditorsuite.building.copyfile",
		"nodeeditorsuite.utilities.deletedsstorefiles",
		"s3.newobject", "s3.getobject",
		"tcp.httpreadurl",
		"target.set", "target.get",
		"filemenu.savemyroot",
		"op.outlinetoxml", "op.xmltooutline", "op.firstsummit", "op.go", "op.insert",
		"op.deleteline", "op.getlinetext", "op.setlinetext", "op.wipe", "op.sort",
		"xml.addattribute", "xml.addvalue", "xml.addtable", "xml.getvalue",
		"xml.getattributevalue", "xml.entityencode", "xml.decompile", "xml.compile",
		"json.compile", "json.decompile",
		"window.frontmost", "op.getcursor", "tcp.dns.getdottedid",
		"xml.opml.getbodyaddress", "export.sendobject", "file.getdatepath",
		"string.multiplereplaceall", "xml.entitydecode",
		"op.setcursor", "s3.objectexists", "fatpages.buildfileatts"
		];

	stubNames.forEach (function (name) {
		verbs [name] = function (args) {
			return ({flStub: true, verb: name});
			};
		});

	//the folder helpers resolve from the path map so folder math works end-to-end

	verbs ["nodeeditorsuite.getfolder"] = function (args) {
		return (thePathMap.helpers.getFolder);
		};

	verbs ["nodeeditorsuite.getallserversfolder"] = function (args) {
		return (thePathMap.helpers.getAllServersFolder);
		};

	verbs ["nodeeditorsuite.getgithubfolder"] = function (args) {
		return (thePathMap.helpers.getGitHubFolder);
		};

	return ({verbs, macToReal});
	}

exports.makeVerbs = makeVerbs;
