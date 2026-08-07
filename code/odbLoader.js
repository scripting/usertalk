/*  Load Dave's real object database into the interpreter's namespace:
	user.* from root.user.fttb, config.nodeEditor.projects from the
	projects fttb, and the whole nodeEditor guest database (the suite).
	
	Tables become plain objects. Scripts and outlines become
	{flOdbScript, lines} records the evaluator can parse and call on
	first use. Addresses become {flOdbAddressText, path}.
	
	by CC, 7/27/26 */

const fs = require ("fs");

var frontierOdb; //assigned by requireFrontierOdb, on the first loadOdb

const options = { //where the database files live; defaults are DW's Mac, loadOdb (userOptions) overrides
	pathFrontierOdb: "/Users/davewiner/Claude/frontierOdb/frontierodb.js",
	pathUserFttb: "/Users/davewiner/Claude/frontierOdb/misc/root.user.fttb",
	pathProjectsFttb: "/Users/davewiner/Claude/frontierOdb/misc/nodeEditor.projects.fttb",
	pathSuiteJson: "/Users/davewiner/Claude/daveMigrates/misc/nodeEditor.json"
	};

function requireFrontierOdb () { //the require happens here, not when the module loads, so requiring usertalk works on machines that don't have these files
	if (frontierOdb === undefined) {
		try {
			frontierOdb = require ("frontierodb"); //an installed copy wins
			}
		catch (err) {
			frontierOdb = require (options.pathFrontierOdb);
			}
		}
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
	
	return (theValue); //binary and friends ride along as markers
	}

function convertTopLevel (theTable) {
	const result = {};
	Object.keys (theTable).forEach (function (name) {
		result [name] = convertValue (theTable [name]);
		});
	return (result);
	}

function loadOdb (userOptions) {
	
	if (userOptions !== undefined) {
		for (var x in userOptions) {
			options [x] = userOptions [x];
			}
		}
	requireFrontierOdb ();
	
	const theOdb = {};
	
	//the whole nodeEditor guest database: nodeEditorSuite and friends
	const theSuiteDb = JSON.parse (fs.readFileSync (options.pathSuiteJson, "utf8"));
	Object.keys (theSuiteDb).forEach (function (name) {
		theOdb [name] = convertValue (theSuiteDb [name]);
		});
	
	//user.* -- his real user table
	const theUserPage = frontierOdb.readFatPage (options.pathUserFttb);
	theOdb.user = convertTopLevel (theUserPage.value.value);
	
	//config.nodeEditor.projects -- the 511 projects
	const theProjectsPage = frontierOdb.readFatPage (options.pathProjectsFttb);
	theOdb.config = {
		nodeEditor: {
			projects: convertTopLevel (theProjectsPage.value.value)
			}
		};
	
	theOdb.scratchpad = {};
	theOdb.system = theOdb.system || {};
	theOdb.frontier = {pathstring: "Macintosh HD:Users:davewiner:frontier:"};
	
	return (theOdb);
	}

exports.loadOdb = loadOdb;
