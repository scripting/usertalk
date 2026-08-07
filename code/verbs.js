/*  The verb library for the UserTalk interpreter prototype: real file
	verbs over Node fs behind a Mac-colon-path map, the string and clock
	verbs the build scripts use, and loud trace-only stubs for the rest.
	
	Unimplemented verbs fail loudly -- nothing silently succeeds.
	
	by CC, 7/27/26 */

const fs = require ("fs");
const path = require ("path");
const {execFileSync} = require ("child_process"); //8/5/26 by CC -- the S3 verbs run a helper, see s3helper.js

function makeVerbs (thePathMap, theTrace) {
	
	function macToReal (theColonPath) {
		theColonPath = String (theColonPath); //filespecs coerce to their path
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
		rest.split (":").forEach (function (segment) { //8/4/26 by CC -- a ".." segment would walk out of the mapped folder
			if (segment === "..") {
				const message = "Can't map the path " + theColonPath + " because it steps outside its folder.";
				throw new Error (message);
				}
			});
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
	
	verbs ["string.multiplereplaceall"] = function (args) {
		
		/*  8/4/26 by CC -- string.multipleReplaceAll (s, @table, flCaseSensitive, startCharacters, endCharacters).
			One replace-all per table entry, in sorted order, the search string
			built as start + entryName + end, the replacement the entry's value
			as a string. Semantics from the kernel's stringmultiplereplaceallverb:
			flCaseSensitive defaults true, and false means the match ignores case.  */
		
		var theString = String (args [0]);
		var theTable = args [1];
		if ((theTable !== undefined) && (theTable !== null) && (theTable.flAddress === true)) {
			theTable = theTable.reference.get ();
			}
		if ((theTable === undefined) || (theTable === null) || (typeof theTable !== "object")) {
			const message = "Can't do the replacements because the second parameter isn't a table or the address of one.";
			throw new Error (message);
			}
		const flCaseSensitive = (args [2] === undefined) ? true : Boolean (args [2]);
		const startCharacters = (args [3] === undefined) ? "" : String (args [3]);
		const endCharacters = (args [4] === undefined) ? "" : String (args [4]);
		
		const sortedNames = Object.keys (theTable).sort (function (a, b) {
			return (a.toLowerCase () < b.toLowerCase () ? -1 : 1);
			});
		sortedNames.forEach (function (name) {
			const searchFor = startCharacters + name + endCharacters;
			if (searchFor.length === 0) {
				return;
				}
			const replaceWith = verbs ["string"] ([theTable [name]]);
			if (flCaseSensitive) {
				theString = theString.split (searchFor).join (replaceWith);
				}
			else {
				const lowerSearch = searchFor.toLowerCase ();
				var result = "";
				var rest = theString;
				var ixFound = rest.toLowerCase ().indexOf (lowerSearch);
				while (ixFound !== -1) {
					result += rest.slice (0, ixFound) + replaceWith;
					rest = rest.slice (ixFound + searchFor.length);
					ixFound = rest.toLowerCase ().indexOf (lowerSearch);
					}
				theString = result + rest;
				}
			});
		return (theString);
		};
	
	verbs ["string"] = function (args) {
		const theValue = args [0];
		if ((theValue !== undefined) && (theValue !== null) && (theValue.flAddress === true)) {
			/*  8/5/26 by CC -- string of an address is the path it names, the way
				Frontier prints an objspec. It was answering "[object Object]",
				and scripts test it: getCanonicalSiteName asks whether the site
				address string endsWith a known suffix.  */
			return (String (theValue.pathText));
			}
		if ((theValue !== undefined) && (theValue !== null) && (theValue.flOdbScript === true)) {
			/*  string of an outline or script is its text: each line at its
				depth in tabs, lines joined by returns.  */
			const textLines = [];
			theValue.lines.forEach (function (line) {
				if (line.flComment) {
					return;
					}
				var tabs = "";
				var ct = line.level;
				while (ct > 0) {
					tabs += "\t";
					ct--;
					}
				textLines.push (tabs + line.text);
				});
			return (textLines.join ("\r"));
			}
		return (String (theValue));
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
		if (theValue.flFilespec === true) {
			return ("filespectype");
			}
		if (theValue.flWpText === true) {
			return ("wptexttype");
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
			if (theValue.nameText !== undefined) { //8/5/26 by CC -- the address carries its own name, because a name can contain dots
				return (theValue.nameText);
				}
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
	
	verbs ["delete"] = function (args) { //7/27/26 by CC -- delete (@table.entry)
		const theAddress = args [0];
		if ((theAddress === undefined) || (theAddress.flAddress !== true)) {
			const message = "Can't delete the object because the parameter isn't an address.";
			throw new Error (message);
			}
		if (theAddress.reference.remove !== undefined) {
			theAddress.reference.remove ();
			}
		else {
			theAddress.reference.set (undefined);
			}
		return (true);
		};
	
	verbs ["script.newscriptobject"] = function (args) { //7/27/26 by CC -- source text to a script object at an address
		const theText = String (args [0]);
		const theAddress = args [1];
		const lines = [];
		theText.split (/\r\n|\r|\n/).forEach (function (lineText) {
			var level = 0;
			while (lineText.indexOf ("\t") === 0) {
				level++;
				lineText = lineText.slice (1);
				}
			lines.push ({level, text: lineText, flExpanded: true, flComment: false, flBreakpoint: false});
			});
		const theScript = {flOdbScript: true, scriptType: "script", lines};
		if ((theAddress === undefined) || (theAddress.flAddress !== true)) {
			return (theScript);
			}
		theAddress.reference.set (theScript);
		return (true);
		};
	
	verbs ["file.getpathchar"] = function (args) {
		return (":"); //Frontier's native path character
		};
	
	verbs ["tcp.mydottedid"] = function (args) {
		return ("localhost");
		};
	
	verbs ["tcp.dns.getmydomainname"] = function (args) {
		return ("localhost");
		};
	
	verbs ["frontier.version"] = function (args) {
		return ("10.1"); //the snapshot generation this odb came from
		};
	
	verbs ["frontier.getprogramname"] = function (args) {
		return ("usertalk");
		};
	
	verbs ["frontier.getprogrampath"] = function (args) {
		return ("Macintosh HD:frontier:OPML.app"); //the folder above it is where Guest Databases lives
		};
	
	verbs ["scripterror"] = function (args) { //the language's throw; "!redirect url" faked errors ride the message
		throw new Error (String (args [0]));
		};
	
	verbs ["thread.getcurrentid"] = function (args) {
		return (1); //one thread in this world
		};
	
	verbs ["sys.os"] = function (args) {
		return ("Unix"); //the answers system.environment already gives, as the verb form
		};
	
	verbs ["sys.systemtask"] = function (args) {
		return (true);
		};
	
	verbs ["sys.time"] = function (args) {
		return (new Date ());
		};
	
	verbs ["sys.milliseconds"] = function (args) {
		return (Date.now ());
		};
	
	verbs ["sys.getusername"] = function (args) {
		return ("manila");
		};
	
	verbs ["sys.memavail"] = function (args) {
		return (64 * 1024 * 1024);
		};
	
	verbs ["lang.timemodified"] = function (args) { //timeModified (adr or value) -- no per-cell timestamps here, now is honest enough
		return (new Date ());
		};
	
	verbs ["timemodified"] = verbs ["lang.timemodified"];
	
	verbs ["timecreated"] = verbs ["lang.timemodified"];
	
	verbs ["lang.timecreated"] = verbs ["lang.timemodified"];
	
	verbs ["menu.isinstalled"] = function (args) {
		return (false); //no menu bar in this world
		};
	
	verbs ["thread.sleepfor"] = function (args) {
		return (true); //one thread, no sleeping
		};
	
	verbs ["thread.sleep"] = verbs ["thread.sleepfor"];
	
	verbs ["thread.exists"] = function (args) {
		return (false);
		};
	
	//UI-only kernel verbs: safe no-ops, there's no screen here
	const uiNoOpNames = [
		"menu.clearmenubar", "menu.installmenu", "menu.uninstallmenu", "menu.update",
		"menu.addmenu", "menu.deletemenu", "menu.enable", "menu.check",
		"menu.buildmenubar", "menu.getmenubar", "menu.setmenubar", "menu.new",
		"window.show", "window.hide", "window.close", "window.bringtofront", "window.update",
		"window.setposition", "window.setsize", "window.settitle",
		"sys.systemtask", "speaker.sound"
		];
	
	uiNoOpNames.forEach (function (name) {
		verbs [name] = function (args) {
			return (true);
			};
		});
	
	//UI questions answer false: nothing is open, frontmost or on screen here
	const uiFalseNames = [
		"window.ismenuscript", "window.isopen", "window.isfront", "window.isvisible",
		"window.frontmost", "dialog.ask", "dialog.confirm", "dialog.yesnocancel"
		];
	
	uiFalseNames.forEach (function (name) {
		verbs [name] = function (args) {
			return (false);
			};
		});
	
	verbs ["semaphores.lock"] = function (args) {
		return (true); //one thread, locks always succeed
		};
	
	verbs ["semaphores.unlock"] = function (args) {
		return (true);
		};
	
	verbs ["semaphore.lock"] = verbs ["semaphores.lock"];
	
	verbs ["semaphore.unlock"] = verbs ["semaphores.unlock"];
	
	verbs ["table.sortby"] = function (args) {
		return (true); //tables answer positional reads in sorted-by-name order; other sort orders aren't kept yet
		};
	
	verbs ["table.emptytable"] = function (args) {
		const theAddress = args [0];
		if ((theAddress !== undefined) && (theAddress !== null) && (theAddress.flAddress === true)) {
			theAddress.reference.set ({});
			}
		return (true);
		};
	
	verbs ["webserver.builderrorpage"] = function (args) { //kernel verb: the plain error page
		const bigString = String (args [0]);
		const littleString = (args [1] === undefined) ? "" : String (args [1]);
		return ("<html><head><title>" + bigString + "</title></head><body><h1>" + bigString + "</h1><p>" + littleString + "</p></body></html>");
		};
	
	verbs ["script.compile"] = function (args, environment) { //compilation here is the parse; do it now so errors surface at compile time
		const theAddress = args [0];
		if ((theAddress === undefined) || (theAddress.flAddress !== true)) {
			const message = "Can't compile the script because the parameter isn't an address.";
			throw new Error (message);
			}
		const theScript = theAddress.reference.get ();
		if ((theScript === undefined) || (theScript.flOdbScript !== true)) {
			const message = "Can't compile the script at " + theAddress.pathText + " because there is no script there.";
			throw new Error (message);
			}
		if ((theScript.parsedStatements === undefined) && (environment.parseScript !== undefined)) {
			theScript.parsedStatements = environment.parseScript (theScript.lines);
			}
		return (true);
		};
	
	verbs ["file.newfolder"] = function (args) {
		fs.mkdirSync (macToReal (args [0]), {recursive: true});
		return (true);
		};
	
	verbs ["string.popleading"] = function (args) { //strip every leading occurrence of the character
		var theString = String (args [0]);
		const theChar = String (args [1]);
		while (theString.indexOf (theChar) === 0) {
			theString = theString.slice (theChar.length);
			}
		return (theString);
		};
	
	verbs ["string.parsehttpargs"] = function (args) {
		/*  "a=1&b=2" becomes the flat list {"a", "1", "b", "2"} -- names and
			values alternating, url-decoded; webserver.parseArgs walks it two
			at a time.  */
		const theText = String (args [0]);
		const result = [];
		if (theText.trim ().length === 0) {
			return (result);
			}
		function decodePart (thePart) {
			try {
				return (decodeURIComponent (thePart.split ("+").join (" ")));
				}
			catch (err) {
				return (thePart.split ("+").join (" ")); //malformed escapes come through as themselves
				}
			}
		theText.split ("&").forEach (function (pair) {
			if (pair.length === 0) {
				return;
				}
			const ixEquals = pair.indexOf ("=");
			if (ixEquals === -1) {
				result.push (decodePart (pair));
				result.push ("");
				}
			else {
				result.push (decodePart (pair.slice (0, ixEquals)));
				result.push (decodePart (pair.slice (ixEquals + 1)));
				}
			});
		return (result);
		};
	
	verbs ["string.urldecode"] = function (args) {
		return (decodeURIComponent (String (args [0]).split ("+").join (" ")));
		};
	
	verbs ["string.urlencode"] = function (args) {
		return (encodeURIComponent (String (args [0])));
		};
	
	verbs ["string.poptrailing"] = function (args) { //strip every trailing occurrence of the character
		var theString = String (args [0]);
		const theChar = String (args [1]);
		while (theString.endsWith (theChar)) {
			theString = theString.slice (0, theString.length - theChar.length);
			}
		return (theString);
		};
	
	verbs ["string.trimwhitespace"] = function (args) {
		return (String (args [0]).trim ());
		};
	
	verbs ["string.patternmatch"] = function (args) { //1-based index of the pattern, 0 if absent
		return (String (args [1]).indexOf (String (args [0])) + 1);
		};
	
	verbs ["string.urlsplit"] = function (args) { //{protocol, host, path} the Frontier way
		const theUrl = String (args [0]);
		const ixColon = theUrl.indexOf ("://");
		const protocol = theUrl.slice (0, ixColon);
		const rest = theUrl.slice (ixColon + 3);
		const ixSlash = rest.indexOf ("/");
		if (ixSlash === -1) {
			return ([protocol, rest, "/"]);
			}
		return ([protocol, rest.slice (0, ixSlash), rest.slice (ixSlash)]);
		};
	
	verbs ["table.tablecontains"] = function (args) { //is the second address inside the first table? shallow walk
		const adrTable = args [0];
		const adrItem = args [1];
		if ((adrTable === undefined) || (adrTable.flAddress !== true) || (adrItem === undefined) || (adrItem.flAddress !== true)) {
			return (false);
			}
		return (adrItem.pathText.toLowerCase ().indexOf (adrTable.pathText.toLowerCase () + ".") === 0);
		};
	
	/*  Guest databases: an open database is a table at the odb root whose
		name is the file's full colon path, which is exactly what [f]
		resolves to. Opening reads a real .root through frontierOdb;
		creating registers an empty table and touches the real file so
		file.exists agrees; saving is a no-op in this in-memory world.  */
	
	function findDatabaseKey (theOdb, thePath) {
		const lower = thePath.toLowerCase ();
		var found;
		Object.keys (theOdb).forEach (function (key) {
			if ((found === undefined) && (key.toLowerCase () === lower)) {
				found = key;
				}
			});
		return (found);
		}
	
	verbs ["filemenu.open"] = function (args, environment) {
		const thePath = String (args [0]);
		if (findDatabaseKey (environment.odb, thePath) !== undefined) {
			return (true); //already open
			}
		const odbHomeTools = require ("./odbHome.js");
		const frontierOdb = odbHomeTools.requireFrontierOdb ();
		const realPath = macToReal (thePath);
		if (!fs.existsSync (realPath)) {
			const message = "Can't open the database " + thePath + " because there is no file with that name.";
			throw new Error (message);
			}
		if (fs.statSync (realPath).size === 0) { //a marker for a database created in this world: empty table
			environment.odb [thePath] = {};
			return (true);
			}
		const theTopLevel = frontierOdb.readRootFile (realPath);
		const theTable = {};
		Object.keys (theTopLevel).forEach (function (name) {
			theTable [name] = odbHomeTools.convertValue (theTopLevel [name]);
			});
		environment.odb [thePath] = theTable;
		return (true);
		};
	
	verbs ["filemenu.new"] = function (args, environment) {
		const thePath = String (args [0]);
		if (findDatabaseKey (environment.odb, thePath) === undefined) {
			environment.odb [thePath] = {};
			}
		const realPath = macToReal (thePath);
		fs.mkdirSync (path.dirname (realPath), {recursive: true});
		if (!fs.existsSync (realPath)) {
			fs.writeFileSync (realPath, ""); //the marker file, so file.exists agrees the db exists
			}
		return (true);
		};
	
	verbs ["filemenu.save"] = function (args) {
		return (true); //the in-memory world has nothing to flush yet
		};
	
	verbs ["filemenu.savemyroot"] = function (args) {
		return (true);
		};
	
	verbs ["filemenu.close"] = function (args) {
		return (true);
		};
	
	verbs ["string.isalpha"] = function (args) {
		const theChar = String (args [0]).charAt (0);
		return (((theChar >= "a") && (theChar <= "z")) || ((theChar >= "A") && (theChar <= "Z")));
		};
	
	verbs ["string.isnumeric"] = function (args) {
		const theChar = String (args [0]).charAt (0);
		return ((theChar >= "0") && (theChar <= "9"));
		};
	
	verbs ["string.nthchar"] = function (args) {
		return (String (args [0]).charAt (args [1] - 1));
		};
	
	verbs ["string.innercasename"] = function (args) { //"Nirvana Server" -> "nirvanaServer"
		const words = String (args [0]).split (" ");
		var result = "";
		words.forEach (function (word, ixWord) {
			if (word.length === 0) {
				return;
				}
			if (result.length === 0) {
				result += word.charAt (0).toLowerCase () + word.slice (1);
				}
			else {
				result += word.charAt (0).toUpperCase () + word.slice (1);
				}
			});
		return (result);
		};
	
	verbs ["string.insert"] = function (args) { //insert the first string into the second at a 1-based position
		const theInsert = String (args [0]);
		const theString = String (args [1]);
		const ixAt = args [2] - 1;
		return (theString.slice (0, ixAt) + theInsert + theString.slice (ixAt));
		};
	
	verbs ["string.padwithzeros"] = function (args) {
		var theString = String (args [0]);
		while (theString.length < args [1]) {
			theString = "0" + theString;
			}
		return (theString);
		};
	
	verbs ["lang.binary"] = function (args) { //binary coercion; a wrapped string survives the string () round trip
		const theValue = args [0];
		if ((theValue !== undefined) && (theValue !== null) && (typeof theValue === "object") && (theValue.type === "binary")) {
			return (theValue);
			}
		return ({
			type: "binary",
			data: String (theValue),
			toString: function () {
				return (this.data);
				}
			});
		};
	
	verbs ["binary"] = verbs ["lang.binary"];
	
	verbs ["lang.boolean"] = function (args) {
		const theValue = args [0];
		return ((theValue !== false) && (theValue !== undefined) && (theValue !== 0) && (theValue !== "") && (theValue !== "false"));
		};
	
	verbs ["boolean"] = verbs ["lang.boolean"];
	
	verbs ["char"] = function (args) {
		return (String.fromCharCode (Number (args [0])));
		};
	
	verbs ["random"] = function (args) { //random (min, max), character bounds legal
		var min = args [0], max = args [1];
		if (typeof min === "string") {
			min = min.charCodeAt (0);
			}
		if (typeof max === "string") {
			max = max.charCodeAt (0);
			}
		return (min + Math.floor (Math.random () * (max - min + 1)));
		};
	
	verbs ["string.parseaddress"] = function (args, environment) {
		/*  Address text to an address value: "config.manila.sites" or
			"[Macintosh HD:...:site.root].siteTable.sub". Resolves lazily
			against the odb each time it's used, parents created on set.  */
		const theText = String (args [0]);
		const parts = [];
		var rest = theText;
		while (rest.length > 0) {
			if (rest.indexOf ("[") === 0) {
				const ixClose = rest.indexOf ("]");
				var bracketed = rest.slice (1, ixClose);
				if ((bracketed.indexOf ("\"") === 0) && (bracketed.lastIndexOf ("\"") === bracketed.length - 1)) {
					bracketed = bracketed.slice (1, bracketed.length - 1);
					}
				parts.push (bracketed);
				rest = rest.slice (ixClose + 1);
				}
			else {
				var ixDot = rest.indexOf (".");
				var ixBracket = rest.indexOf ("[");
				if (ixDot === -1) {
					ixDot = rest.length;
					}
				if ((ixBracket !== -1) && (ixBracket < ixDot)) {
					ixDot = ixBracket;
					}
				if (ixDot > 0) {
					parts.push (rest.slice (0, ixDot));
					}
				rest = rest.slice (ixDot);
				}
			if (rest.indexOf (".") === 0) {
				rest = rest.slice (1);
				}
			}
		
		function findKeyHere (theTable, theName) {
			if (theTable [theName] !== undefined) {
				return (theName);
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
		
		function walkToParent (flCreate) {
			var current = environment.odb;
			var ixPart;
			for (ixPart = 0; ixPart < parts.length - 1; ixPart++) {
				if ((current === undefined) || (current === null) || (typeof current !== "object")) {
					return (undefined);
					}
				var key = findKeyHere (current, parts [ixPart]);
				if (key === undefined) {
					if (!flCreate) {
						return (undefined);
						}
					key = parts [ixPart];
					current [key] = {};
					}
				current = current [key];
				}
			return (current);
			}
		
		const lastPart = parts [parts.length - 1];
		
		return ({
			flAddress: true,
			pathText: parts.join ("."),
			reference: {
				get: function () {
					const parent = walkToParent (false);
					if ((parent === undefined) || (parent === null) || (typeof parent !== "object")) {
						return (undefined);
						}
					const key = findKeyHere (parent, lastPart);
					return ((key === undefined) ? undefined : parent [key]);
					},
				set: function (theValue) {
					const parent = walkToParent (true);
					if ((parent === undefined) || (parent === null) || (typeof parent !== "object")) {
						const message = "Can't set the value at " + theText + " because the path can't be reached.";
						throw new Error (message);
						}
					var key = findKeyHere (parent, lastPart);
					if (key === undefined) {
						key = lastPart;
						}
					parent [key] = theValue;
					},
				remove: function () {
					const parent = walkToParent (false);
					if ((parent === undefined) || (parent === null) || (typeof parent !== "object")) {
						return;
						}
					const key = findKeyHere (parent, lastPart);
					if (key !== undefined) {
						delete parent [key];
						}
					}
				}
			});
		};
	
	/*  Word-processing text: a string that knows it's a wp object. New
		templates are built from strings, so this covers the create path;
		wptext loaded from old databases still arrives as an undecoded
		marker until frontierOdb learns the format.  */
	
	function makeWpText (theText) {
		return ({
			flWpText: true,
			text: String (theText),
			toString: function () {
				return (this.text);
				}
			});
		}
	
	verbs ["wp.newtextobject"] = function (args) {
		const theObject = makeWpText (args [0]);
		const theAddress = args [1];
		if ((theAddress !== undefined) && (theAddress !== null) && (theAddress.flAddress === true)) {
			theAddress.reference.set (theObject);
			return (true);
			}
		return (theObject);
		};
	
	verbs ["target.set"] = function (args, environment) { //returns the previous target
		if (environment.targetStack === undefined) {
			environment.targetStack = [];
			}
		const oldTarget = environment.targetStack [environment.targetStack.length - 1];
		environment.targetStack.push (args [0]);
		return (oldTarget);
		};
	
	verbs ["target.get"] = function (args, environment) {
		if (environment.targetStack === undefined) {
			return (undefined);
			}
		return (environment.targetStack [environment.targetStack.length - 1]);
		};
	
	verbs ["target.clear"] = function (args, environment) {
		if (environment.targetStack !== undefined) {
			environment.targetStack.pop ();
			}
		return (true);
		};
	
	function currentTargetReference (environment) {
		if ((environment.targetStack === undefined) || (environment.targetStack.length === 0)) {
			const message = "Can't operate on the target because no target is set.";
			throw new Error (message);
			}
		const theTarget = environment.targetStack [environment.targetStack.length - 1];
		if ((theTarget === undefined) || (theTarget.flAddress !== true)) {
			const message = "Can't operate on the target because it isn't an address.";
			throw new Error (message);
			}
		return (theTarget.reference);
		};
	
	verbs ["wp.settext"] = function (args, environment) {
		currentTargetReference (environment).set (makeWpText (args [0]));
		return (true);
		};
	
	verbs ["wp.gettext"] = function (args, environment) {
		return (String (currentTargetReference (environment).get ()));
		};
	
	verbs ["lang.callscript"] = function (args, environment) { //callScript (@adrScript, {params}, adrTableInScope)
		var theScript = args [0];
		while ((theScript !== undefined) && (theScript !== null) && (theScript.flAddress === true)) {
			theScript = theScript.reference.get ();
			}
		if ((theScript === undefined) || (theScript.flOdbScript !== true)) {
			const message = "Can't call the script because the first parameter doesn't lead to a script.";
			throw new Error (message);
			}
		const theArgs = Array.isArray (args [1]) ? args [1] : [];
		var theScopeTable = args [2];
		if ((theScopeTable !== undefined) && (theScopeTable !== null) && (theScopeTable.flAddress === true)) {
			theScopeTable = theScopeTable.reference.get ();
			}
		return (environment.callScriptValue (theScript, theArgs, theScopeTable));
		};
	
	verbs ["callscript"] = verbs ["lang.callscript"];
	
	verbs ["table.assign"] = function (args) { //table.assign (@adr, value)
		const theAddress = args [0];
		if ((theAddress === undefined) || (theAddress.flAddress !== true)) {
			const message = "Can't assign because the first parameter isn't an address.";
			throw new Error (message);
			}
		theAddress.reference.set (args [1]);
		return (true);
		};
	
	verbs ["date.get"] = function (args) { //date.get (d, @day, @month, @year, @hour, @minute, @second)
		const theDate = new Date (args [0]);
		const values = [theDate.getDate (), theDate.getMonth () + 1, theDate.getFullYear (), theDate.getHours (), theDate.getMinutes (), theDate.getSeconds ()];
		values.forEach (function (value, ixValue) {
			const theAddress = args [ixValue + 1];
			if ((theAddress !== undefined) && (theAddress !== null) && (theAddress.flAddress === true)) {
				theAddress.reference.set (value);
				}
			});
		return (true);
		};
	
	verbs ["mrcalendar.getdayaddress"] = function (args) {
		/*  The calendar bottleneck: a date becomes year/month/day nested
			tables under the calendar, created on the way in when allowed.
			Spec preserved in the comment of mainResponder.calendar.getDayAddress.  */
		const adrCalendar = args [0];
		const theDate = new Date (args [1]);
		const flCreate = (args [2] === undefined) ? true : (args [2] !== false);
		const objType = (args [3] === undefined) ? "tabletype" : args [3];
		if ((adrCalendar === undefined) || (adrCalendar.flAddress !== true)) {
			const message = "Can't get the day address because the first parameter isn't an address.";
			throw new Error (message);
			}
		const year = String (theDate.getFullYear ());
		var month = String (theDate.getMonth () + 1);
		var day = String (theDate.getDate ());
		while (month.length < 2) {
			month = "0" + month;
			}
		while (day.length < 2) {
			day = "0" + day;
			}
		var container = adrCalendar.reference.get ();
		if ((container === undefined) && flCreate) {
			adrCalendar.reference.set ({});
			container = adrCalendar.reference.get ();
			}
		const parts = [year, month];
		var flBroken = false;
		parts.forEach (function (part) {
			if (flBroken) {
				return;
				}
			if (container [part] === undefined) {
				if (flCreate) {
					container [part] = {};
					}
				else {
					flBroken = true;
					return;
					}
				}
			container = container [part];
			});
		if (flBroken) {
			container = undefined;
			}
		if ((container !== undefined) && (container [day] === undefined) && flCreate && (objType !== undefined)) {
			container [day] = (objType === "outlinetype") ? {flOdbScript: true, scriptType: "outline", lines: []} : {};
			}
		const dayContainer = container;
		return ({
			flAddress: true,
			pathText: adrCalendar.pathText + "." + year + "." + month + "." + day,
			reference: {
				get: function () {
					return ((dayContainer === undefined) ? undefined : dayContainer [day]);
					},
				set: function (theValue) {
					if (dayContainer === undefined) {
						const message = "Can't set the day because the calendar path couldn't be reached.";
						throw new Error (message);
						}
					dayContainer [day] = theValue;
					},
				remove: function () {
					if (dayContainer !== undefined) {
						delete dayContainer [day];
						}
					}
				}
			});
		};
	
	verbs ["html.drawcalendar"] = function (args, environment) {
		/*  The month calendar, from the original script preserved in the
			comment of mainResponder.calendar.draw: a table for curdate's
			month, days that exist in the calendar table become links to
			urlprefix + year + delim + month + delim + day.  */
		const adrCalendar = args [0];
		const urlPrefix = (args [1] === undefined) ? "" : String (args [1]);
		const colWidth = (args [2] === undefined) ? 32 : args [2];
		const rowHeight = (args [3] === undefined) ? 22 : args [3];
		const tableBorder = (args [4] === undefined) ? 0 : args [4];
		const bgColor = args [5];
		const monthYearTemplate = (args [6] === undefined) ? "<b><center>***</center></b>" : String (args [6]);
		const dayNameTemplate = (args [7] === undefined) ? "<center>***</center>" : String (args [7]);
		const dayTemplate = (args [8] === undefined) ? "<center><b>***</b></center>" : String (args [8]);
		const curDate = (args [9] === undefined) ? new Date () : new Date (args [9]);
		const urlDelimiter = (args [10] === undefined) ? "/" : String (args [10]);
		
		const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
		const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
		
		var calendarTable;
		if ((adrCalendar !== undefined) && (adrCalendar !== null) && (adrCalendar.flAddress === true)) {
			calendarTable = adrCalendar.reference.get ();
			}
		
		const year = curDate.getFullYear ();
		const month = curDate.getMonth (); //0-based here, 1-based in names below
		const yearName = String (year);
		var monthName = String (month + 1);
		while (monthName.length < 2) {
			monthName = "0" + monthName;
			}
		
		function dayEntryExists (dayNumber) {
			if ((calendarTable === undefined) || (calendarTable === null) || (typeof calendarTable !== "object")) {
				return (false);
				}
			var dayName = String (dayNumber);
			while (dayName.length < 2) {
				dayName = "0" + dayName;
				}
			var found = false;
			Object.keys (calendarTable).forEach (function (yearKey) {
				if (yearKey === yearName) {
					const monthTable = calendarTable [yearKey];
					if ((monthTable !== null) && (typeof monthTable === "object")) {
						Object.keys (monthTable).forEach (function (monthKey) {
							if (monthKey === monthName) {
								const dayTable = monthTable [monthKey];
								if ((dayTable !== null) && (typeof dayTable === "object") && (dayTable [dayName] !== undefined)) {
									found = true;
									}
								}
							});
						}
					}
				});
			return (found);
			}
		
		const bgColorString = ((bgColor === undefined) || (bgColor === null)) ? "" : " bgcolor=\"" + String (bgColor) + "\"";
		var htmlText = "";
		
		htmlText += "<table border=\"" + tableBorder + "\">\r";
		htmlText += "<tr><td colspan=\"7\">" + monthYearTemplate.split ("***").join (monthNames [month] + " " + year) + "</td></tr>\r";
		htmlText += "<tr>";
		dayNames.forEach (function (name) {
			htmlText += "<td width=\"" + colWidth + "\">" + dayNameTemplate.split ("***").join (name) + "</td>";
			});
		htmlText += "</tr>\r";
		
		const firstDay = new Date (year, month, 1).getDay ();
		const daysInMonth = new Date (year, month + 1, 0).getDate ();
		
		var cellText = "";
		var ctCells = 0;
		var ixCell;
		for (ixCell = 0; ixCell < firstDay; ixCell++) {
			cellText += "<td width=\"" + colWidth + "\" height=\"" + rowHeight + "\"" + bgColorString + "></td>";
			ctCells++;
			}
		var dayNumber;
		for (dayNumber = 1; dayNumber <= daysInMonth; dayNumber++) {
			var inner = dayTemplate.split ("***").join (String (dayNumber));
			if (dayEntryExists (dayNumber)) {
				var dayName = String (dayNumber);
				while (dayName.length < 2) {
					dayName = "0" + dayName;
					}
				inner = "<a href=\"" + urlPrefix + yearName + urlDelimiter + monthName + urlDelimiter + dayName + "\">" + inner + "</a>";
				}
			cellText += "<td width=\"" + colWidth + "\" height=\"" + rowHeight + "\"" + bgColorString + ">" + inner + "</td>";
			ctCells++;
			if ((ctCells % 7) === 0) {
				htmlText += "<tr>" + cellText + "</tr>\r";
				cellText = "";
				}
			}
		if (cellText.length > 0) {
			while ((ctCells % 7) !== 0) {
				cellText += "<td width=\"" + colWidth + "\" height=\"" + rowHeight + "\"" + bgColorString + "></td>";
				ctCells++;
				}
			htmlText += "<tr>" + cellText + "</tr>\r";
			}
		htmlText += "</table>\r";
		
		return (htmlText);
		};
	
	verbs ["html.processmacros"] = function (args, environment) {
		/*  The macro processor: everything between balanced curly braces is
			a UserTalk expression, evaluated with the macro tables and the
			page table in scope, its result substituted into the text. A
			macro that fails leaves its error in the page, in brackets, so
			the page still renders and the problem names itself.  */
		const theText = String (args [0]);
		const adrPageTable = args [2];
		
		const scopeTables = [];
		function pushScope (theTable) {
			if ((theTable !== undefined) && (theTable !== null) && (typeof theTable === "object")) {
				scopeTables.push (theTable);
				}
			}
		function tableAt (theParent, theName) {
			if ((theParent === undefined) || (theParent === null) || (typeof theParent !== "object")) {
				return (undefined);
				}
			return (theParent [theName]);
			}
		const builtins = environment.odb.system.verbs.builtins;
		pushScope (tableAt (tableAt (builtins.html, "data"), "standardMacros"));
		pushScope (tableAt (tableAt (environment.odb.user, "html"), "macros"));
		pushScope (environment.odb.manilaMacros); //the manilaMacros search-path addition, PBS 05/11/00
		var pageTable;
		if ((adrPageTable !== undefined) && (adrPageTable !== null) && (adrPageTable.flAddress === true)) {
			pageTable = adrPageTable.reference.get ();
			pushScope (pageTable); //innermost: {title} answers the page table's title
			}
		
		var result = "";
		var ix = 0;
		while (ix < theText.length) {
			const ch = theText.charAt (ix);
			if (ch !== "{") {
				result += ch;
				ix++;
				continue;
				}
			//find the balanced closing brace, quotes respected
			var depth = 0;
			var ixScan = ix;
			var quoteChar = "";
			var ixClose = -1;
			while (ixScan < theText.length) {
				const chScan = theText.charAt (ixScan);
				if (quoteChar !== "") {
					if (chScan === "\\") {
						ixScan++;
						}
					else {
						if (chScan === quoteChar) {
							quoteChar = "";
							}
						}
					}
				else {
					if ((chScan === "\"") || (chScan === "'")) {
						quoteChar = chScan;
						}
					if (chScan === "{") {
						depth++;
						}
					if (chScan === "}") {
						depth--;
						if (depth === 0) {
							ixClose = ixScan;
							break;
							}
						}
					}
				ixScan++;
				}
			if (ixClose === -1) { //no closing brace: the rest is literal
				result += theText.slice (ix);
				break;
				}
			const macroText = theText.slice (ix + 1, ixClose);
			var expansion;
			try {
				const statements = environment.parseScript ([{level: 0, text: macroText, flComment: false}]);
				const value = environment.evaluateWithScopes (statements, scopeTables);
				expansion = ((value === undefined) || (value === true)) ? "" : String (value);
				}
			catch (err) {
				expansion = "[Macro error: " + err.message + "]";
				}
			result += expansion;
			ix = ixClose + 1;
			}
		return (result);
		};
	
	verbs ["html.getpref"] = function (args, environment) {
		/*  A page-build preference: the page table answers first (directives
			land there), then user.html.prefs, then false.  */
		const prefName = String (args [0]).toLowerCase ();
		const adrPageTable = args [1];
		function lookIn (theTable) {
			if ((theTable === undefined) || (theTable === null) || (typeof theTable !== "object")) {
				return (undefined);
				}
			var found;
			Object.keys (theTable).forEach (function (key) {
				if ((found === undefined) && (key.toLowerCase () === prefName)) {
					found = theTable [key];
					}
				});
			return (found);
			}
		var value;
		if ((adrPageTable !== undefined) && (adrPageTable !== null) && (adrPageTable.flAddress === true)) {
			value = lookIn (adrPageTable.reference.get ());
			}
		if (value === undefined) {
			const userTable = environment.odb.user;
			if ((userTable !== undefined) && (userTable.html !== undefined)) {
				value = lookIn (userTable.html.prefs);
				}
			}
		if (value === undefined) {
			return (false);
			}
		return (value);
		};
	
	function calendarBoundaryDay (args, flLast) {
		const adrCalendar = args [0];
		var calendarTable;
		if ((adrCalendar !== undefined) && (adrCalendar !== null) && (adrCalendar.flAddress === true)) {
			calendarTable = adrCalendar.reference.get ();
			}
		if ((calendarTable === undefined) || (calendarTable === null) || (typeof calendarTable !== "object")) {
			const message = "Can't get the " + (flLast ? "last" : "first") + " day because the calendar can't be reached.";
			throw new Error (message);
			}
		function numericKeys (theTable) {
			const keys = [];
			Object.keys (theTable).forEach (function (key) {
				if (/^\d+$/.test (key) && (theTable [key] !== null) && (typeof theTable [key] === "object")) {
					keys.push (key);
					}
				});
			keys.sort ();
			return (keys);
			}
		const years = numericKeys (calendarTable);
		if (years.length === 0) {
			const message = "Can't get the " + (flLast ? "last" : "first") + " day because the calendar is empty.";
			throw new Error (message);
			}
		const year = flLast ? years [years.length - 1] : years [0];
		const months = numericKeys (calendarTable [year]);
		const month = flLast ? months [months.length - 1] : months [0];
		const days = numericKeys (calendarTable [year] [month]);
		const day = flLast ? days [days.length - 1] : days [0];
		return (new Date (Number (year), Number (month) - 1, Number (day)));
		}
	
	verbs ["mrcalendar.getfirstday"] = function (args) {
		return (calendarBoundaryDay (args, false));
		};
	
	verbs ["mrcalendar.getlastday"] = function (args) {
		return (calendarBoundaryDay (args, true));
		};
	
	function callS3Helper (theCommand) { //8/5/26 by CC
		
		/*  Run one S3 operation in a child process and wait for it. UserTalk is
			synchronous and daveS3 is callback-based; this is the seam. The path
			map's s3 section supplies the default ACL and, when daveS3 doesn't
			live beside us, where to find the helper.  */
		
		const theSettings = (thePathMap.s3 === undefined) ? {} : thePathMap.s3;
		const pathHelper = (theSettings.pathHelper === undefined) ? (__dirname + "/s3helper.js") : theSettings.pathHelper;
		
		var theAnswer;
		try {
			const theOutput = execFileSync (process.execPath, [pathHelper], {
				input: JSON.stringify (theCommand),
				encoding: "utf8",
				maxBuffer: 64 * 1024 * 1024,
				cwd: (theSettings.folderHelper === undefined) ? path.dirname (pathHelper) : theSettings.folderHelper
				});
			theAnswer = JSON.parse (theOutput);
			}
		catch (err) {
			const message = "Can't reach S3 because the helper failed: " + err.message;
			throw new Error (message);
			}
		
		if (theAnswer.flError === true) {
			const message = "Can't " + theCommand.verb + " " + theCommand.path + " because " + theAnswer.message;
			throw new Error (message);
			}
		return (theAnswer.value);
		}
	
	verbs ["s3.newobject"] = function (args) { //8/5/26 by CC -- s3.newObject (path, data, type, acl)
		const theSettings = (thePathMap.s3 === undefined) ? {} : thePathMap.s3;
		const theType = ((args [2] === undefined) || (args [2] === null)) ? undefined : String (args [2]);
		const theAcl = ((args [3] === undefined) || (args [3] === null)) ? theSettings.defaultAcl : String (args [3]);
		return (callS3Helper ({verb: "newobject", path: String (args [0]), data: String (args [1]), type: theType, acl: theAcl}));
		};
	
	verbs ["s3.getobject"] = function (args) { //8/5/26 by CC
		return (callS3Helper ({verb: "getobject", path: String (args [0])}));
		};
	
	verbs ["s3.objectexists"] = function (args) { //8/5/26 by CC
		return (callS3Helper ({verb: "objectexists", path: String (args [0])}));
		};
	
	function deepCopyValue (theValue) { //8/5/26 by CC -- a table copies structurally; everything else is a value
		
		if ((theValue === undefined) || (theValue === null) || (typeof theValue !== "object")) {
			return (theValue);
			}
		if ((theValue.flAddress === true) || (theValue.flOdbScript === true) || (theValue.flWpText === true) || (theValue.flOdbSqlTable === true) || Array.isArray (theValue) || (theValue instanceof Date) || (theValue.type !== undefined)) {
			return (theValue);
			}
		
		const seen = new Map ();
		function copyTable (theTable) {
			if (seen.has (theTable)) {
				return (seen.get (theTable));
				}
			const theCopy = {};
			seen.set (theTable, theCopy);
			Object.keys (theTable).forEach (function (theKey) {
				theCopy [theKey] = deepCopyValue (theTable [theKey]);
				});
			return (theCopy);
			}
		return (copyTable (theValue));
		}
	
	verbs ["table.copy"] = function (args) { //8/5/26 by CC -- table.copy (adrSource, adrDest)
		
		/*  Copy what's at one address to another. The copy is structural, the way
			Frontier's is: the destination is independent of the source, so editing
			one never shows up in the other.  */
		
		const adrSource = args [0];
		const adrDest = args [1];
		if ((adrSource === undefined) || (adrSource === null) || (adrSource.flAddress !== true)) {
			const message = "Can't copy because the first parameter isn't an address.";
			throw new Error (message);
			}
		if ((adrDest === undefined) || (adrDest === null) || (adrDest.flAddress !== true)) {
			const message = "Can't copy because the second parameter isn't an address.";
			throw new Error (message);
			}
		adrDest.reference.set (deepCopyValue (adrSource.reference.get ()));
		return (true);
		};
	
	verbs ["html.neutermacros"] = function (args) { //8/5/26 by CC
		
		/*  html.neuterMacros (s, adrLegalMacros) -- defang the macros in text that
			came from outside, leaving the ones the site has declared legal.
			Manila's own manilaSuite.unTaint says what neutering is: "All {
			characters are translated to &#123;", which stops the macro from
			expanding. The second parameter is the address of a table whose entry
			names are the macros allowed to survive.  */
		
		const theText = String (args [0]);
		const theAddress = args [1];
		var theLegal = undefined;
		if ((theAddress !== undefined) && (theAddress !== null) && (theAddress.flAddress === true)) {
			theLegal = theAddress.reference.get ();
			}
		else {
			if ((theAddress !== null) && (typeof theAddress === "object")) {
				theLegal = theAddress;
				}
			}
		
		function flIsLegal (theName) {
			if ((theLegal === undefined) || (theLegal === null) || (typeof theLegal !== "object")) {
				return (false);
				}
			const theLower = theName.toLowerCase ();
			var flFound = false;
			Object.keys (theLegal).forEach (function (theKey) {
				if (theKey.toLowerCase () === theLower) {
					flFound = true;
					}
				});
			return (flFound);
			}
		
		var theResult = "";
		var ixScan = 0;
		while (ixScan < theText.length) {
			const theChar = theText.charAt (ixScan);
			if (theChar === "{") {
				var ixName = ixScan + 1;
				while ((ixName < theText.length) && (/[A-Za-z0-9_.]/.test (theText.charAt (ixName)))) {
					ixName++;
					}
				const theName = theText.slice (ixScan + 1, ixName);
				if ((theName.length > 0) && flIsLegal (theName)) {
					theResult += theChar;
					}
				else {
					theResult += "&#123;";
					}
				}
			else {
				theResult += theChar;
				}
			ixScan++;
			}
		return (theResult);
		};
	
	verbs ["date.set"] = function (args) { //8/5/26 by CC -- date.set (day, month, year, hour, minute, second), the inverse of date.get
		const theDay = (args [0] === undefined) ? 1 : Number (args [0]);
		const theMonth = (args [1] === undefined) ? 1 : Number (args [1]);
		const theYear = (args [2] === undefined) ? 1904 : Number (args [2]);
		const theHour = (args [3] === undefined) ? 0 : Number (args [3]);
		const theMinute = (args [4] === undefined) ? 0 : Number (args [4]);
		const theSecond = (args [5] === undefined) ? 0 : Number (args [5]);
		return (new Date (theYear, theMonth - 1, theDay, theHour, theMinute, theSecond));
		};
	
	verbs ["mrcalendar.getmostrecentday"] = function (args) { //8/5/26 by CC
		
		/*  The day at or before d that the calendar actually has, as a date at
			midnight. The spec is written out in the old-code comment inside
			mainResponder.calendar.getMostRecentDay: walk backwards from d until
			a day exists, and fail when the calendar holds nothing that early.
			The old script walked one day at a time; picking the greatest day
			that isn't after d gives the same answer without the walk.  */
		
		const adrCalendar = args [0];
		var calendarTable;
		if ((adrCalendar !== undefined) && (adrCalendar !== null) && (adrCalendar.flAddress === true)) {
			calendarTable = adrCalendar.reference.get ();
			}
		else {
			calendarTable = adrCalendar;
			}
		if ((calendarTable === undefined) || (calendarTable === null) || (typeof calendarTable !== "object")) {
			const message = "Can't get the most recent day because the calendar can't be reached.";
			throw new Error (message);
			}
		
		const theDate = (args [1] === undefined) ? new Date () : new Date (args [1]);
		const theLimit = new Date (theDate.getFullYear (), theDate.getMonth (), theDate.getDate ()).getTime ();
		
		function numericKeys (theTable) {
			const theKeys = [];
			Object.keys (theTable).forEach (function (theKey) {
				if (/^\d+$/.test (theKey) && (theTable [theKey] !== null) && (typeof theTable [theKey] === "object")) {
					theKeys.push (theKey);
					}
				});
			theKeys.sort ();
			return (theKeys);
			}
		
		var theBest = undefined;
		numericKeys (calendarTable).forEach (function (theYear) {
			numericKeys (calendarTable [theYear]).forEach (function (theMonth) {
				numericKeys (calendarTable [theYear] [theMonth]).forEach (function (theDay) {
					const theCandidate = new Date (Number (theYear), Number (theMonth) - 1, Number (theDay)).getTime ();
					if (theCandidate <= theLimit) {
						if ((theBest === undefined) || (theCandidate > theBest)) {
							theBest = theCandidate;
							}
						}
					});
				});
			});
		
		if (theBest === undefined) {
			const message = "Can't get the most recent day in the calendar because the calendar doesn't contain any elements before " + theDate + ".";
			throw new Error (message);
			}
		return (new Date (theBest));
		};
	
	verbs ["html.neutertags"] = function (args) {
		/*  The kernel primitive that defangs markup; the policy lives in
			mainResponder.neuterText, which calls this. Pass-through for
			now -- fine for a local sandbox, not for a public server.  */
		return (String (args [0]));
		};
	
	verbs ["html.getpagetableaddress"] = function (args, environment) {
		/*  The current page table: the address registered per thread at
			system.temp.pageTableAddresses -- the webserver registers the
			request's param table, and buildObject registers the table it
			renders into. One thread here, so one slot. With nothing
			registered, a scratch table stands in, the way an editor-run
			macro gets one.  */
		const systemTemp = environment.odb.system.temp;
		if (systemTemp.pageTableAddresses !== undefined) {
			const registered = systemTemp.pageTableAddresses ["1"];
			if ((registered !== undefined) && (registered !== null) && (registered.flAddress === true)) {
				return (registered);
				}
			}
		if (systemTemp.currentPageTable === undefined) {
			systemTemp.currentPageTable = {};
			}
		return ({
			flAddress: true,
			pathText: "system.temp.currentPageTable",
			reference: {
				get: function () {
					return (environment.odb.system.temp.currentPageTable);
					},
				set: function (theValue) {
					environment.odb.system.temp.currentPageTable = theValue;
					},
				remove: function () {
					delete environment.odb.system.temp.currentPageTable;
					}
				}
			});
		};
	
	verbs ["html.deletepagetableaddress"] = function (args, environment) {
		const systemTemp = environment.odb.system.temp;
		if (systemTemp.pageTableAddresses !== undefined) {
			delete systemTemp.pageTableAddresses ["1"];
			}
		delete systemTemp.currentPageTable;
		return (true);
		};
	
	verbs ["lang.new"] = function (args, environment) {
		return (verbs ["new"] (args, environment));
		};
	
	verbs ["lang.msg"] = function (args, environment) {
		return (verbs ["msg"] (args, environment));
		};
	
	verbs ["lang.delete"] = function (args, environment) {
		return (verbs ["delete"] (args, environment));
		};
	
	verbs ["lang.sizeof"] = function (args, environment) {
		return (verbs ["sizeof"] (args, environment));
		};
	
	verbs ["lang.defined"] = function (args, environment) {
		return (verbs ["defined"] (args, environment));
		};
	
	verbs ["lang.typeof"] = function (args, environment) {
		return (verbs ["typeof"] (args, environment));
		};
	
	verbs ["lang.nameof"] = function (args, environment) {
		return (verbs ["nameof"] (args, environment));
		};
	
	verbs ["lang.string"] = function (args, environment) {
		return (verbs ["string"] (args, environment));
		};
	
	verbs ["lang.number"] = function (args, environment) {
		return (verbs ["number"] (args, environment));
		};
	
	verbs ["lang.date"] = function (args, environment) {
		return (verbs ["date"] (args, environment));
		};
	
	verbs ["lang.char"] = function (args, environment) {
		return (verbs ["char"] (args, environment));
		};
	
	verbs ["lang.random"] = function (args, environment) {
		return (verbs ["random"] (args, environment));
		};
	
	verbs ["lang.scripterror"] = function (args, environment) {
		return (verbs ["scripterror"] (args, environment));
		};
	
	verbs ["lang.list"] = function (args, environment) {
		return (verbs ["list"] (args, environment));
		};
	
	verbs ["lang.address"] = function (args, environment) { //address coercion: text becomes an address, an address passes through
		const theValue = args [0];
		if ((theValue !== undefined) && (theValue !== null) && (theValue.flAddress === true)) {
			return (theValue);
			}
		return (verbs ["string.parseaddress"] ([String (theValue)], environment));
		};
	
	verbs ["address"] = verbs ["lang.address"];
	
	verbs ["lang.long"] = function (args) {
		return (Math.trunc (Number (args [0])));
		};
	
	verbs ["long"] = verbs ["lang.long"];
	
	verbs ["lang.double"] = function (args) {
		return (Number (args [0]));
		};
	
	verbs ["double"] = verbs ["lang.double"];
	
	verbs ["lang.abs"] = function (args) {
		return (Math.abs (Number (args [0])));
		};
	
	verbs ["abs"] = verbs ["lang.abs"];
	
	verbs ["lang.mod"] = function (args) {
		return (Number (args [0]) % Number (args [1]));
		};
	
	verbs ["lang.filespec"] = function (args) {
		/*  A filespec is a value that knows it's a file path. It coerces to
			its path in string context, so path arithmetic just works.  */
		return ({
			flFilespec: true,
			path: String (args [0]),
			toString: function () {
				return (this.path);
				}
			});
		};
	
	verbs ["filespec"] = verbs ["lang.filespec"];
	
	verbs ["list"] = function (args) { //coerce to a list
		const theValue = args [0];
		if (Array.isArray (theValue)) {
			return (theValue);
			}
		if (theValue === undefined) {
			return ([]);
			}
		return ([theValue]);
		};
	
	verbs ["string.popfilefromaddress"] = function (args) { //the address's path with the database part popped
		const theAddress = args [0];
		if ((theAddress !== undefined) && (theAddress !== null) && (theAddress.flAddress === true)) {
			var pathText = theAddress.pathText;
			if (pathText.indexOf ("(deref).") === 0) {
				pathText = pathText.slice ("(deref).".length);
				}
			return (pathText);
			}
		return (String (theAddress));
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
	
	verbs ["date.versionlessthan"] = function (args) { //compare version strings like "7.0d8" component-wise
		function componentsOf (theVersion) {
			const result = [];
			String (theVersion).split (".").forEach (function (part) {
				const match = part.match (/^\d+/);
				result.push ((match === null) ? 0 : Number (match [0]));
				});
			return (result);
			}
		const left = componentsOf (args [0]);
		const right = componentsOf (args [1]);
		var ixPart;
		for (ixPart = 0; ixPart < Math.max (left.length, right.length); ixPart++) {
			const a = left [ixPart] || 0;
			const b = right [ixPart] || 0;
			if (a < b) {
				return (true);
				}
			if (a > b) {
				return (false);
				}
			}
		return (false);
		};
	
	verbs ["date.prevmonth"] = function (args) {
		const theDate = new Date (args [0]);
		return (new Date (theDate.getFullYear (), theDate.getMonth () - 1, Math.min (theDate.getDate (), 28)));
		};
	
	verbs ["date.nextmonth"] = function (args) {
		const theDate = new Date (args [0]);
		return (new Date (theDate.getFullYear (), theDate.getMonth () + 1, Math.min (theDate.getDate (), 28)));
		};
	
	verbs ["date.firstofmonth"] = function (args) {
		const theDate = new Date (args [0]);
		return (new Date (theDate.getFullYear (), theDate.getMonth (), 1));
		};
	
	verbs ["date.lastofmonth"] = function (args) {
		const theDate = new Date (args [0]);
		return (new Date (theDate.getFullYear (), theDate.getMonth () + 1, 0));
		};
	
	verbs ["date.daysinmonth"] = function (args) {
		const theDate = new Date (args [0]);
		return (new Date (theDate.getFullYear (), theDate.getMonth () + 1, 0).getDate ());
		};
	
	verbs ["date.yesterday"] = function (args) {
		return (new Date (Date.now () - (24 * 60 * 60 * 1000)));
		};
	
	verbs ["date.tomorrow"] = function (args) {
		return (new Date (Date.now () + (24 * 60 * 60 * 1000)));
		};
	
	verbs ["date.year"] = function (args) {
		return (new Date (args [0]).getFullYear ());
		};
	
	verbs ["date.month"] = function (args) {
		return (new Date (args [0]).getMonth () + 1);
		};
	
	verbs ["date.day"] = function (args) {
		return (new Date (args [0]).getDate ());
		};
	
	verbs ["date.hour"] = function (args) {
		return (new Date (args [0]).getHours ());
		};
	
	verbs ["date.minute"] = function (args) {
		return (new Date (args [0]).getMinutes ());
		};
	
	verbs ["date.second"] = function (args) {
		return (new Date (args [0]).getSeconds ());
		};
	
	verbs ["date.dayofweek"] = function (args) {
		return (new Date (args [0]).getDay () + 1); //1-based, Sunday first
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
		"tcp.httpreadurl",
		"op.xmltooutline", "op.firstsummit", "op.go", "op.insert",
		"op.deleteline", "op.getlinetext", "op.setlinetext", "op.wipe", "op.sort",
		"json.compile", "json.decompile",
		"window.frontmost", "op.getcursor", "tcp.dns.getdottedid",
		"export.sendobject", "file.getdatepath",
		"op.setcursor", "fatpages.buildfileatts"
		];
	
	stubNames.forEach (function (name) {
		verbs [name] = function (args) {
			return ({flStub: true, verb: name});
			};
		});
	
	/*  The xml verbs, Frontier's XML-tables convention: an element is a
		table entry whose name is "NNNNN\tname" (numbered for document
		order), attributes live in a "/atts" subtable, character data in a
		"/pcdata" entry.  */
	
	function xmlEntityEncode (theString) {
		/*  8/4/26 by CC -- ">" stays raw, matching Frontier: nodeEditorSuite's
			title replacement searches for "&lt;%title%>" with a bare ">", so an
			encoder that touched ">" would break every glossary substitution in
			generated opml.  */
		return (String (theString)
			.split ("&").join ("&amp;")
			.split ("<").join ("&lt;")
			.split ("\"").join ("&quot;"));
		}
	
	function xmlEntityDecode (theString) {
		return (String (theString)
			.split ("&lt;").join ("<")
			.split ("&gt;").join (">")
			.split ("&quot;").join ("\"")
			.split ("&apos;").join ("'")
			.split ("&amp;").join ("&"));
		}
	
	function xmlDisplayName (theName) { //strip the "NNNNN\t" ordering prefix
		const ixTab = String (theName).indexOf ("\t");
		if (ixTab === -1) {
			return (String (theName));
			}
		return (String (theName).slice (ixTab + 1));
		}
	
	function xmlNumberedName (theCounter, theName) {
		var counterText = String (theCounter);
		while (counterText.length < 5) {
			counterText = "0" + counterText;
			}
		return (counterText + "\t" + theName);
		}
	
	function xmlCompileText (theText) {
		
		/*  A small well-formed-XML parser, enough for the documents Manila
			writes for itself: elements, attributes, pcdata, comments and
			processing instructions skipped.  */
		
		var ix = 0;
		var counter = 0;
		
		function skipUntil (theMarker) {
			const ixFound = theText.indexOf (theMarker, ix);
			ix = (ixFound === -1) ? theText.length : ixFound + theMarker.length;
			}
		
		function parseElement () { //ix is at "<" of an open tag; returns {name, table}
			
			/*  8/4/26 by CC -- the tag ends at the first ">" OUTSIDE quotes:
				attribute values legally carry raw ">" (Frontier's encoder leaves
				it raw), so indexOf would cut the tag mid-attribute.  */
			
			var ixScanEnd = ix + 1;
			var flInQuote = false;
			while (ixScanEnd < theText.length) {
				const ch = theText.charAt (ixScanEnd);
				if (ch === "\"") {
					flInQuote = !flInQuote;
					}
				if ((ch === ">") && !flInQuote) {
					break;
					}
				ixScanEnd++;
				}
			const ixEnd = ixScanEnd;
			var tagText = theText.slice (ix + 1, ixEnd);
			const flSelfClosing = tagText.endsWith ("/");
			if (flSelfClosing) {
				tagText = tagText.slice (0, tagText.length - 1);
				}
			ix = ixEnd + 1;
			
			const nameMatch = tagText.match (/^[^\s]+/);
			const elementName = nameMatch [0];
			const theTable = {};
			
			const attsPattern = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g;
			var attsMatch;
			const atts = {};
			var ctAtts = 0;
			while ((attsMatch = attsPattern.exec (tagText)) !== null) {
				atts [attsMatch [1]] = xmlEntityDecode (attsMatch [2]);
				ctAtts++;
				}
			if (ctAtts > 0) {
				theTable ["/atts"] = atts;
				}
			
			if (flSelfClosing) {
				return ({name: elementName, table: theTable});
				}
			
			var pcdata = "";
			while (ix < theText.length) {
				if (theText.charAt (ix) === "<") {
					if (theText.slice (ix, ix + 4) === "<!--") {
						skipUntil ("-->");
						continue;
						}
					if (theText.slice (ix, ix + 9).toLowerCase () === "<![cdata[") {
						const ixCdataEnd = theText.indexOf ("]]>", ix);
						pcdata += theText.slice (ix + 9, ixCdataEnd);
						ix = ixCdataEnd + 3;
						continue;
						}
					if (theText.charAt (ix + 1) === "/") { //our close tag
						skipUntil (">");
						break;
						}
					if ((theText.charAt (ix + 1) === "?") || (theText.charAt (ix + 1) === "!")) {
						skipUntil (">");
						continue;
						}
					counter++;
					const child = parseElement ();
					theTable [xmlNumberedName (counter, child.name)] = child.table;
					continue;
					}
				pcdata += theText.charAt (ix);
				ix++;
				}
			if (pcdata.trim ().length > 0) {
				theTable ["/pcdata"] = xmlEntityDecode (pcdata.trim ());
				}
			return ({name: elementName, table: theTable});
			}
		
		/*  Walk the prolog to the root element. 8/4/26 by CC: processing
			instructions are CAPTURED as entries, the way Frontier's xml.compile
			stores them -- "?xml" with the attributes as plain entries -- so a
			structure round-trips through decompile with its declaration.
			Comments and doctypes are still skipped.  */
		
		const thePis = [];
		while (ix < theText.length) {
			if (theText.charAt (ix) === "<") {
				if (theText.charAt (ix + 1) === "?") {
					const ixEnd = theText.indexOf (">", ix);
					var piText = theText.slice (ix + 2, (ixEnd === -1) ? theText.length : ixEnd);
					if (piText.endsWith ("?")) {
						piText = piText.slice (0, piText.length - 1);
						}
					const piName = (piText.match (/^[^\s]*/)) [0];
					const piTable = {};
					const piAttsPattern = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g;
					var piMatch;
					while ((piMatch = piAttsPattern.exec (piText)) !== null) {
						piTable [piMatch [1]] = xmlEntityDecode (piMatch [2]);
						}
					if (piName.length > 0) {
						thePis.push ({name: "?" + piName, table: piTable});
						}
					ix = (ixEnd === -1) ? theText.length : ixEnd + 1;
					continue;
					}
				if (theText.charAt (ix + 1) === "!") {
					skipUntil (">");
					continue;
					}
				break;
				}
			ix++;
			}
		if (ix >= theText.length) {
			if (theText.trim ().length === 0) {
				return ({}); //nothing to compile: an empty structure, which the callers' emptiness guards understand
				}
			const message = "Can't compile the XML because no root element was found in \"" + theText.slice (0, 80) + "\".";
			throw new Error (message);
			}
		const compiled = {};
		thePis.forEach (function (pi) {
			counter++;
			compiled [xmlNumberedName (counter, pi.name)] = pi.table;
			});
		counter++;
		const root = parseElement ();
		compiled [xmlNumberedName (counter, root.name)] = root.table;
		return (compiled);
		}
	
	verbs ["xml.compile"] = function (args) {
		const compiled = xmlCompileText (String (args [0]));
		const theAddress = args [1];
		if ((theAddress !== undefined) && (theAddress !== null) && (theAddress.flAddress === true)) {
			theAddress.reference.set (compiled);
			return (true);
			}
		return (compiled);
		};
	
	verbs ["xml.converttodisplayname"] = function (args) {
		return (xmlDisplayName (args [0]));
		};
	
	verbs ["xml.entityencode"] = function (args) {
		return (xmlEntityEncode (args [0]));
		};
	
	verbs ["xml.entitydecode"] = function (args) {
		return (xmlEntityDecode (args [0]));
		};
	
	function xmlChildEntry (theTable, theName) { //find a child element by display name, case-insensitive
		const lowerName = String (theName).toLowerCase ();
		var foundKey;
		Object.keys (theTable).forEach (function (key) {
			if ((foundKey === undefined) && (xmlDisplayName (key).toLowerCase () === lowerName)) {
				foundKey = key;
				}
			});
		return (foundKey);
		}
	
	verbs ["xml.getaddress"] = function (args) { //xml.getAddress (@struct, name) -> address of the named child element
		const theAddress = args [0];
		const theName = String (args [1]);
		if ((theAddress === undefined) || (theAddress.flAddress !== true)) {
			const message = "Can't get the XML address because the first parameter isn't an address.";
			throw new Error (message);
			}
		const theTable = theAddress.reference.get ();
		if ((theTable === undefined) || (theTable === null) || (typeof theTable !== "object")) {
			const message = "Can't get the XML address of " + theName + " because the structure can't be reached.";
			throw new Error (message);
			}
		const foundKey = xmlChildEntry (theTable, theName);
		if (foundKey === undefined) {
			const message = "Can't get the XML address of " + theName + " because there is no element with that name.";
			throw new Error (message);
			}
		return ({
			flAddress: true,
			pathText: theAddress.pathText + ".[\"" + foundKey + "\"]",
			reference: {
				get: function () {
					return (theTable [foundKey]);
					},
				set: function (theValue) {
					theTable [foundKey] = theValue;
					},
				remove: function () {
					delete theTable [foundKey];
					}
				}
			});
		};
	
	verbs ["xml.getaddresslist"] = function (args) { //every child element with that name, as addresses
		const theAddress = args [0];
		const theName = String (args [1]).toLowerCase ();
		if ((theAddress === undefined) || (theAddress.flAddress !== true)) {
			const message = "Can't get the XML address list because the first parameter isn't an address.";
			throw new Error (message);
			}
		const theTable = theAddress.reference.get ();
		const result = [];
		if ((theTable === undefined) || (theTable === null) || (typeof theTable !== "object")) {
			return (result);
			}
		Object.keys (theTable).forEach (function (key) {
			if (xmlDisplayName (key).toLowerCase () !== theName) {
				return;
				}
			result.push ({
				flAddress: true,
				pathText: theAddress.pathText + ".[\"" + key + "\"]",
				reference: {
					get: function () {
						return (theTable [key]);
						},
					set: function (theValue) {
						theTable [key] = theValue;
						},
					remove: function () {
						delete theTable [key];
						}
					}
				});
			});
		return (result);
		};
	
	verbs ["xml.getvalue"] = function (args) { //xml.getValue (@struct, name) -> the named child's pcdata
		const childAddress = verbs ["xml.getaddress"] (args);
		const childTable = childAddress.reference.get ();
		if ((childTable !== null) && (typeof childTable === "object")) {
			if (childTable ["/pcdata"] !== undefined) {
				return (childTable ["/pcdata"]);
				}
			return ("");
			}
		return (String (childTable));
		};
	
	verbs ["xml.getattribute"] = function (args) { //the ADDRESS of an attribute -- callers dereference it
		const theAddress = args [0];
		const theName = String (args [1]);
		if ((theAddress === undefined) || (theAddress.flAddress !== true)) {
			const message = "Can't get the XML attribute because the first parameter isn't an address.";
			throw new Error (message);
			}
		const theTable = theAddress.reference.get ();
		if ((theTable === undefined) || (theTable === null) || (typeof theTable !== "object") || (theTable ["/atts"] === undefined)) {
			const message = "Can't get the XML attribute " + theName + " because the element has no attributes.";
			throw new Error (message);
			}
		const atts = theTable ["/atts"];
		var foundKey;
		Object.keys (atts).forEach (function (key) {
			if ((foundKey === undefined) && (key.toLowerCase () === theName.toLowerCase ())) {
				foundKey = key;
				}
			});
		if (foundKey === undefined) {
			const message = "Can't get the XML attribute " + theName + " because there is no attribute with that name.";
			throw new Error (message);
			}
		return ({
			flAddress: true,
			pathText: theAddress.pathText + ".[\"/atts\"].[\"" + foundKey + "\"]",
			reference: {
				get: function () {
					return (atts [foundKey]);
					},
				set: function (theValue) {
					atts [foundKey] = theValue;
					},
				remove: function () {
					delete atts [foundKey];
					}
				}
			});
		};
	
	verbs ["xml.getattributevalue"] = function (args) { //xml.getAttributeValue (@element, name)
		const theAddress = args [0];
		const theName = String (args [1]);
		if ((theAddress === undefined) || (theAddress.flAddress !== true)) {
			const message = "Can't get the XML attribute because the first parameter isn't an address.";
			throw new Error (message);
			}
		const theTable = theAddress.reference.get ();
		if ((theTable !== undefined) && (theTable !== null) && (typeof theTable === "object") && (theTable ["/atts"] !== undefined)) {
			const atts = theTable ["/atts"];
			var found;
			Object.keys (atts).forEach (function (key) {
				if ((found === undefined) && (key.toLowerCase () === theName.toLowerCase ())) {
					found = atts [key];
					}
				});
			if (found !== undefined) {
				return (found);
				}
			}
		const message = "Can't get the XML attribute " + theName + " because there is no attribute with that name.";
		throw new Error (message);
		};
	
	verbs ["xml.addtable"] = function (args) { //xml.addTable (@struct, name) -> address of a new numbered child table
		const theAddress = args [0];
		const theName = String (args [1]);
		if ((theAddress === undefined) || (theAddress.flAddress !== true)) {
			const message = "Can't add the XML table because the first parameter isn't an address.";
			throw new Error (message);
			}
		var theTable = theAddress.reference.get ();
		if ((theTable === undefined) || (theTable === null) || (typeof theTable !== "object")) {
			theAddress.reference.set ({});
			theTable = theAddress.reference.get ();
			}
		const newKey = xmlNumberedName (Object.keys (theTable).length + 1, theName);
		theTable [newKey] = {};
		return ({
			flAddress: true,
			pathText: theAddress.pathText + ".[\"" + newKey + "\"]",
			reference: {
				get: function () {
					return (theTable [newKey]);
					},
				set: function (theValue) {
					theTable [newKey] = theValue;
					},
				remove: function () {
					delete theTable [newKey];
					}
				}
			});
		};
	
	verbs ["xml.addvalue"] = function (args) { //xml.addValue (@struct, name, value)
		const theAddress = args [0];
		if ((theAddress === undefined) || (theAddress === null) || (theAddress.flAddress !== true)) {
			return (true); //a nil debug log just swallows the value
			}
		const theName = String (args [1]);
		var theTable = theAddress.reference.get ();
		if ((theTable === undefined) || (theTable === null) || (typeof theTable !== "object")) {
			theAddress.reference.set ({});
			theTable = theAddress.reference.get ();
			}
		theTable [xmlNumberedName (Object.keys (theTable).length + 1, theName)] = args [2];
		return (true);
		};
	
	function xmlDecompileTable (theTable, theIndent) {
		var result = "";
		Object.keys (theTable).forEach (function (key) {
			if ((key === "/atts") || (key === "/pcdata")) {
				return;
				}
			const child = theTable [key];
			const elementName = xmlDisplayName (key);
			if (elementName.startsWith ("?")) {
				
				/*  8/4/26 by CC -- a processing instruction, the way Frontier's
					xml.compile stores one: the entries are its attributes, in
					table order. The shell struct's ?xml entry emits as
					<?xml encoding="..." version="..."?> -- the attribute order
					nodeEditorSuite.fixBuggyXml exists to correct, so the desktop
					pipeline behaves identically here.  */
				
				var piText = "<" + elementName;
				if ((child !== null) && (typeof child === "object")) {
					Object.keys (child).forEach (function (attName) {
						if ((attName !== "/atts") && (attName !== "/pcdata")) {
							piText += " " + attName + "=\"" + xmlEntityEncode (child [attName]) + "\"";
							}
						});
					}
				result += theIndent + piText + "?>\r\n";
				return;
				}
			var attsText = "";
			if ((child !== null) && (typeof child === "object") && (child ["/atts"] !== undefined)) {
				Object.keys (child ["/atts"]).forEach (function (attName) {
					attsText += " " + attName + "=\"" + xmlEntityEncode (child ["/atts"] [attName]) + "\"";
					});
				}
			if ((child !== null) && (typeof child === "object")) {
				const inner = xmlDecompileTable (child, theIndent + "\t");
				const pcdata = (child ["/pcdata"] === undefined) ? "" : xmlEntityEncode (child ["/pcdata"]);
				if ((inner.length === 0) && (pcdata.length === 0)) {
					result += theIndent + "<" + elementName + attsText + " />\r\n";
					}
				else {
					if (inner.length === 0) {
						result += theIndent + "<" + elementName + attsText + ">" + pcdata + "</" + elementName + ">\r\n";
						}
					else {
						result += theIndent + "<" + elementName + attsText + ">\r\n" + inner + theIndent + "</" + elementName + ">\r\n";
						}
					}
				}
			else {
				result += theIndent + "<" + elementName + attsText + ">" + xmlEntityEncode (child) + "</" + elementName + ">\r\n";
				}
			});
		return (result);
		}
	
	verbs ["xml.decompile"] = function (args) {
		const theAddress = args [0];
		var theTable = theAddress;
		if ((theAddress !== undefined) && (theAddress !== null) && (theAddress.flAddress === true)) {
			theTable = theAddress.reference.get ();
			}
		if ((theTable === undefined) || (theTable === null) || (typeof theTable !== "object")) {
			const message = "Can't decompile the XML because the structure can't be reached.";
			throw new Error (message);
			}
		var flHasPi = false; //8/4/26 by CC -- a structure carrying its own ?xml entry supplies the declaration
		Object.keys (theTable).forEach (function (key) {
			if (xmlDisplayName (key).startsWith ("?")) {
				flHasPi = true;
				}
			});
		if (flHasPi) {
			return (xmlDecompileTable (theTable, ""));
			}
		return ("<?xml version=\"1.0\"?>\r\n" + xmlDecompileTable (theTable, ""));
		};
	
	verbs ["xml.opml.getbodyaddress"] = function (args) {
		
		/*  8/4/26 by CC -- the address of the body element inside a compiled
			OPML document: the opml element's body child, found the same way
			xml.getAddress finds any child.  */
		
		const theAddress = args [0];
		if ((theAddress === undefined) || (theAddress === null) || (theAddress.flAddress !== true)) {
			const message = "Can't get the body address because the parameter isn't the address of a compiled XML structure.";
			throw new Error (message);
			}
		const opmlAddress = verbs ["xml.getaddress"] ([theAddress, "opml"]);
		return (verbs ["xml.getaddress"] ([opmlAddress, "body"]));
		};
	
	verbs ["op.outlinetoxml"] = function (args) {
		
		/*  8/4/26 by CC -- serialize an outline value to OPML text. The lines
			carry a level each; the stack holds the level of every open element,
			so level jumps the database can hold still close correctly (the same
			debugged shape as trigger's scriptToOpml). Comment lines are emitted
			with isComment="true" so downstream filters see them.  */
		
		var theValue = args [0];
		var theTitle = "outline";
		if ((theValue !== undefined) && (theValue !== null) && (theValue.flAddress === true)) {
			const parts = theValue.pathText.split (".");
			theTitle = parts [parts.length - 1];
			theValue = theValue.reference.get ();
			}
		if ((theValue === undefined) || (theValue === null) || (!Array.isArray (theValue.lines))) {
			const message = "Can't convert the outline to XML because the value isn't an outline or a script.";
			throw new Error (message);
			}
		
		var theText = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<opml version=\"2.0\">\n\t<head>\n\t\t<title>" + xmlEntityEncode (theTitle) + "</title>\n\t\t</head>\n\t<body>\n";
		const openLevels = [];
		function indent (ctTabs) {
			var theTabs = "";
			while (ctTabs > 0) {
				theTabs += "\t";
				ctTabs--;
				}
			return (theTabs);
			}
		function closeOne () {
			openLevels.pop ();
			theText += indent (openLevels.length + 2) + "</outline>\n";
			}
		theValue.lines.forEach (function (line) {
			if ((line !== null) && (typeof line === "object") && (typeof line.text === "string")) {
				const theLevel = Math.min (Math.max (Number (line.level) || 0, 0), 100);
				while ((openLevels.length > 0) && (openLevels [openLevels.length - 1] >= theLevel)) {
					closeOne ();
					}
				theText += indent (openLevels.length + 2) + "<outline text=\"" + xmlEntityEncode (line.text) + "\"" + ((line.flComment) ? " isComment=\"true\"" : "") + ">\n";
				openLevels.push (theLevel);
				}
			});
		while (openLevels.length > 0) {
			closeOne ();
			}
		theText += "\t\t</body>\n\t</opml>\n";
		return (theText);
		};
	
	verbs ["html.directory.getrawhtml"] = function (args) {
		
		/*  8/4/26 by CC -- the renderer at the heart of uploadScripts, as a
			verb, shadowing the database's 2012 two-param copy (hard tabs, \r\n,
			no comment filter -- rendering comment nodes into output files).
			The desktop's current version honors the parameters; its semantics
			were verified byte-for-byte against Dave's deployed renders (7/23):
			one line per node, a tab per depth level when flIndent, line ends
			"\n" times ctLineEnds, comment nodes skipped unless
			flIncludeComments. args [2] (ignore # directives) and args [4]
			(lineEndChars) are accepted and unused -- the verified renders
			use "\n".  */
		
		const adrNode = args [0];
		const adrText = args [1];
		const ctLineEnds = (args [3] === undefined) ? 1 : Number (args [3]);
		const flIndent = (args [5] === undefined) ? true : Boolean (args [5]);
		const flIncludeComments = (args [6] === undefined) ? false : Boolean (args [6]);
		if ((adrNode === undefined) || (adrNode === null) || (adrNode.flAddress !== true)) {
			const message = "Can't render the node because the first parameter isn't an address.";
			throw new Error (message);
			}
		if ((adrText === undefined) || (adrText === null) || (adrText.flAddress !== true)) {
			const message = "Can't render the node because the second parameter isn't the address to answer through.";
			throw new Error (message);
			}
		const theTable = adrNode.reference.get ();
		if ((theTable === undefined) || (theTable === null) || (typeof theTable !== "object")) {
			const message = "Can't render the node because there is no element at the address.";
			throw new Error (message);
			}
		
		var htmltext = "";
		var lineEnd = "";
		var ctEnds = ctLineEnds;
		while (ctEnds > 0) {
			lineEnd += "\n";
			ctEnds--;
			}
		function doLevel (levelTable, depth) {
			Object.keys (levelTable).forEach (function (key) {
				if ((key === "/atts") || (key === "/pcdata")) {
					return;
					}
				if (!xmlDisplayName (key).toLowerCase ().endsWith ("outline")) {
					return;
					}
				const child = levelTable [key];
				if ((child === null) || (typeof child !== "object")) {
					return;
					}
				const atts = (child ["/atts"] === undefined) ? {} : child ["/atts"];
				if ((atts.isComment === "true") && !flIncludeComments) {
					return;
					}
				var theLine = (atts.text === undefined) ? "" : String (atts.text);
				if (flIndent) {
					var tabs = "";
					var ctTabs = depth;
					while (ctTabs > 0) {
						tabs += "\t";
						ctTabs--;
						}
					theLine = tabs + theLine;
					}
				htmltext += theLine + lineEnd;
				doLevel (child, depth + 1);
				});
			}
		doLevel (theTable, 0);
		adrText.reference.set (htmltext);
		return (true);
		};
	
	//the folder helpers resolve from the path map so folder math works end-to-end
	
	/*  8/7/26 by CC -- these install ONLY when the path map supplies a
		value. They used to install unconditionally, which meant the real
		scripts at these addresses in the database NEVER ran: DW edited
		nodeEditorSuite.getAllServersFolder and his change had no effect,
		because the helper shadowed it. With no helper configured, the verb
		isn't registered, and the call falls through to the script.  */

	if (thePathMap.helpers.getFolder !== undefined) {
		verbs ["nodeeditorsuite.getfolder"] = function (args) {
			return (thePathMap.helpers.getFolder);
			};
		}

	if (thePathMap.helpers.getAllServersFolder !== undefined) {
		verbs ["nodeeditorsuite.getallserversfolder"] = function (args) {
			return (thePathMap.helpers.getAllServersFolder);
			};
		}

	if (thePathMap.helpers.getGitHubFolder !== undefined) {
		verbs ["nodeeditorsuite.getgithubfolder"] = function (args) {
			return (thePathMap.helpers.getGitHubFolder);
			};
		}
	
	return ({verbs, macToReal});
	}

exports.makeVerbs = makeVerbs;
