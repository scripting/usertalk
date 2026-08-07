/*  Assemble the interpreter's object database from a folder -- Dave's
	way of putting his universe back together by manipulating the file
	system and reloading.
	
	The rules, from the top of the folder down:
	
	1. A subfolder is a table, named for the folder.
	2. A .root file (a Frontier guest database) or a .json file (a
	   database already dumped by frontierOdb) is a DATABASE: its
	   top-level entries merge into the table at that spot, the way
	   guest databases blend into Frontier's namespace via system.paths.
	3. A .fttb, .ftop or .ftsc file (a fat page export) is a SINGLE
	   OBJECT: it mounts as one entry named for the file, extension
	   dropped. Name the file what you want the object called.
	4. Later arrivals win collisions -- files load alphabetically, then
	   subfolders. When both sides are tables they merge; otherwise the
	   newcomer replaces, and the collision is logged.
	
	Tables become plain objects, scripts and outlines become
	{flOdbScript, lines} records the evaluator parses on first call,
	addresses become {flOdbAddressText, path} -- the same shapes
	odbLoader.js produces.
	
	by CC, 7/27/26 */

const fs = require ("fs");
const pathTool = require ("path");

function requireFrontierOdb () { //the npm package if installed, else a checkout beside this one
	
	try {
		return (require ("frontierodb"));
		}
	catch (err) {
		}
	
	var found;
	const places = [
		pathTool.join (__dirname, "..", "..", "frontierOdb", "frontierodb.js"), //packages side by side
		pathTool.join (__dirname, "..", "frontierOdb", "frontierodb.js"), //shipped inside one folder
		"/Users/davewiner/Claude/frontierOdb/frontierodb.js"
		];
	places.forEach (function (thePlace) {
		if ((found === undefined) && fs.existsSync (thePlace)) {
			found = thePlace;
			}
		});
	
	if (found === undefined) {
		const message = "Can't read the object database because frontierodb isn't installed and no copy was found beside this package.";
		throw new Error (message);
		}
	return (require (found));
	}

function convertValue (theValue) {
	
	if ((theValue === undefined) || (theValue === null)) {
		return (undefined);
		}
	
	if (typeof theValue !== "object") {
		return (theValue);
		}
	
	if (theValue.type === "table") {
		const table = {};
		Object.keys (theValue.value).forEach (function (name) {
			table [name] = convertValue (theValue.value [name]);
			});
		return (table);
		}
	
	if (((theValue.type === "script") || (theValue.type === "outline")) && (theValue.lines !== undefined)) {
		return ({flOdbScript: true, scriptType: theValue.type, lines: theValue.lines});
		}
	
	if (theValue.type === "address") {
		return ({flOdbAddressText: true, path: theValue.path});
		}
	
	if ((theValue.type === "wptext") && (theValue.text !== undefined)) {
		return ({ //word-processing text: knows what it is, reads as its text
			flWpText: true,
			text: theValue.text,
			toString: function () {
				return (this.text);
				}
			});
		}
	
	return (theValue); //binary and friends ride along as markers
	}

function loadFolder (folderPath, logCallback) {
	
	const log = (logCallback === undefined) ? function () {} : logCallback;
	const frontierOdb = requireFrontierOdb ();
	
	function flTable (theValue) {
		return ((theValue !== undefined) && (theValue !== null) &&
			(typeof theValue === "object") &&
			(theValue.flOdbScript === undefined) && (theValue.flOdbAddressText === undefined) &&
			(theValue.type === undefined) && (!Array.isArray (theValue)));
		}
	
	function mergeInto (theTable, theName, theValue, theSource, thePath) {
		const existing = theTable [theName];
		const entryPath = (thePath === "") ? theName : thePath + "." + theName;
		if (flTable (existing) && flTable (theValue)) {
			Object.keys (theValue).forEach (function (childName) {
				mergeInto (existing, childName, theValue [childName], theSource, entryPath);
				});
			}
		else {
			/*  Replacing a value with a newer one is the normal way later
				files win -- only a shape change is worth a log line.  */
			if ((existing !== undefined) && (flTable (existing) !== flTable (theValue))) {
				log ("Collision at " + entryPath + ": " + theSource + " replaced a " + (flTable (existing) ? "table" : "value") + " with a " + (flTable (theValue) ? "table" : "value") + ".");
				}
			theTable [theName] = theValue;
			}
		}
	
	function mergeDatabase (theTable, theTopLevel, theSource) { //a .root or .json: top-level entries blend in
		Object.keys (theTopLevel).forEach (function (name) {
			mergeInto (theTable, name, convertValue (theTopLevel [name]), theSource, "");
			});
		}
	
	function loadOneFolder (theFolderPath, theTable) {
		
		const folderNames = [];
		const fileNames = [];
		
		fs.readdirSync (theFolderPath).forEach (function (fname) {
			if (fname.indexOf (".") === 0) { //.DS_Store and friends
				return;
				}
			if (fs.statSync (pathTool.join (theFolderPath, fname)).isDirectory ()) {
				folderNames.push (fname);
				}
			else {
				fileNames.push (fname);
				}
			});
		
		fileNames.sort ();
		folderNames.sort ();
		
		fileNames.forEach (function (fname) {
			const filePath = pathTool.join (theFolderPath, fname);
			const extension = pathTool.extname (fname).toLowerCase ();
			const baseName = pathTool.basename (fname, pathTool.extname (fname));
			if (extension === ".root") {
				mergeDatabase (theTable, frontierOdb.readRootFile (filePath), fname);
				log ("Merged the database " + fname + ".");
				return;
				}
			if (extension === ".json") {
				mergeDatabase (theTable, JSON.parse (fs.readFileSync (filePath, "utf8")), fname);
				log ("Merged the database " + fname + ".");
				return;
				}
			if ((extension === ".fttb") || (extension === ".ftop") || (extension === ".ftsc")) {
				const thePage = frontierOdb.readFatPage (filePath);
				mergeInto (theTable, baseName, convertValue (thePage.value), fname, "");
				log ("Mounted " + fname + " as " + baseName + ".");
				return;
				}
			if ((extension === ".md") || (extension === ".txt")) { //notes ride along quietly
				return;
				}
			log ("Skipped " + fname + " because " + extension + " isn't a database or a fat page.");
			});
		
		folderNames.forEach (function (fname) {
			if (theTable [fname] === undefined) {
				theTable [fname] = {};
				}
			loadOneFolder (pathTool.join (theFolderPath, fname), theTable [fname]);
			});
		}
	
	if (!fs.existsSync (folderPath)) {
		const message = "Can't load the odb folder " + folderPath + " because there is no folder with that name.";
		throw new Error (message);
		}
	
	const theOdb = {};
	loadOneFolder (folderPath, theOdb);
	
	//the tables every script assumes are there
	if (theOdb.scratchpad === undefined) {
		theOdb.scratchpad = {};
		}
	if (theOdb.config === undefined) {
		theOdb.config = {};
		}
	if (theOdb.system === undefined) {
		theOdb.system = {};
		}
	if (theOdb.user === undefined) {
		theOdb.user = {};
		}
	
	return (theOdb);
	}

exports.loadFolder = loadFolder;
exports.convertValue = convertValue;
exports.requireFrontierOdb = requireFrontierOdb;
