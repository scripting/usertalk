/*  The object database in SQL.
	
	One row per object, identified by an integer id, with parentid
	pointing at the table it lives in. Names are opaque -- a Frontier name
	can contain dots, spaces and tabs, so nothing is built by gluing names
	together. An address like system.verbs.builtins.string.lower resolves
	by walking, one indexed lookup per component.
	
	Nothing is written back to the .root format: a database is built from
	roots once, and from then on the database is the truth.
	
	The reader hands the evaluator ordinary-looking tables that are really
	proxies -- a child materializes when something asks for it, the way
	the kernel loads a value when it's touched instead of holding the
	whole database in memory.
	
	by CC, 7/28/26 */

const fs = require ("fs");
const pathTool = require ("path");

const idRoot = 0; //the root table's children have parentid 0

function requireSqlite () {
	try {
		return (require ("better-sqlite3"));
		}
	catch (err) {
		const message = "Can't use the SQL object database because better-sqlite3 isn't installed.";
		throw new Error (message);
		}
	}

const createScript = `
	create table if not exists odb (
		id integer primary key autoincrement,
		parentid integer not null,
		name text not null,
		lowername text not null,
		type text not null,
		value text
		);
	create index if not exists odbparent on odb (parentid, lowername);
	`;

function valueType (theValue) { //the type name that goes in the row
	if ((theValue === undefined) || (theValue === null)) {
		return ("novalue");
		}
	if (typeof theValue === "string") {
		return ("string");
		}
	if (typeof theValue === "number") {
		return ("number");
		}
	if (typeof theValue === "boolean") {
		return ("boolean");
		}
	if (theValue instanceof Date) {
		return ("date");
		}
	if (Array.isArray (theValue)) {
		return ("list");
		}
	if (theValue.flOdbScript === true) {
		return (theValue.scriptType === "outline" ? "outline" : "script");
		}
	if (theValue.flWpText === true) {
		return ("wptext");
		}
	if (theValue.flOdbAddressText === true) {
		return ("address");
		}
	if (theValue.flOdbSqlTable === true) {
		return ("table");
		}
	if (theValue.type !== undefined) {
		/*  An undecoded value -- frontierOdb kept it as a marker carrying
			its Frontier type and byte count. It gets its own row type, so a
			marker that says "string" is never mistaken for a string.  */
		return ("marker");
		}
	return ("table");
	}

function encodeValue (theValue, theType) {
	const theText = encodeValueText (theValue, theType);
	return ((theText === undefined) ? null : theText); //the column is never undefined
	}

function encodeValueText (theValue, theType) { //everything but a table becomes text
	switch (theType) {
		case "novalue": case "table":
			return (null);
		case "string":
			return (theValue);
		case "number": case "boolean":
			return (String (theValue));
		case "date":
			return (theValue.toISOString ());
		case "list":
			return (JSON.stringify (theValue));
		case "script": case "outline":
			return (JSON.stringify (theValue.lines));
		case "wptext":
			return (theValue.text);
		case "address":
			return (theValue.path);
		default: //a marker: the Frontier type and how many bytes, not the bytes
			return (JSON.stringify ({type: theValue.type, length: theValue.length}));
		}
	}

function decodeValue (theText, theType) {
	switch (theType) {
		case "novalue":
			return (undefined);
		case "string":
			return (theText);
		case "number":
			return (Number (theText));
		case "boolean":
			return (theText === "true");
		case "date":
			return (new Date (theText));
		case "list":
			return (JSON.parse (theText));
		case "script": case "outline":
			return ({flOdbScript: true, scriptType: theType, lines: JSON.parse (theText)});
		case "wptext":
			return ({
				flWpText: true,
				text: theText,
				toString: function () {
					return (this.text);
					}
				});
		case "address":
			return ({flOdbAddressText: true, path: theText});
		default: //a marker comes back the shape frontierOdb gave it
			return (JSON.parse (theText));
		}
	}

function flPlainTable (theValue) { //a table, as opposed to a value that happens to be an object
	if ((theValue === undefined) || (theValue === null) || (typeof theValue !== "object")) {
		return (false);
		}
	if (theValue.flOdbSqlTable === true) { //already one of ours
		return (true);
		}
	return ((theValue.flOdbScript === undefined) && (theValue.flWpText === undefined) &&
		(theValue.flOdbAddressText === undefined) && (theValue.type === undefined) &&
		(!Array.isArray (theValue)) && (!(theValue instanceof Date)));
	}

function buildDatabase (folderOdb, pathDatabase, logCallback) {
	
	/*  Read a folder of roots the way odbHome does and write it into a
		database. This happens once; after it, the roots are history.  */
	
	const log = (logCallback === undefined) ? function () {} : logCallback;
	const sqlite3 = requireSqlite ();
	const odbHome = require ("./odbHome.js");
	
	if (fs.existsSync (pathDatabase)) {
		fs.unlinkSync (pathDatabase);
		}
	fs.mkdirSync (pathTool.dirname (pathDatabase), {recursive: true});
	
	const theDatabase = new sqlite3 (pathDatabase);
	theDatabase.pragma ("journal_mode = WAL");
	theDatabase.exec (createScript);
	
	const insert = theDatabase.prepare ("insert into odb (parentid, name, lowername, type, value) values (?, ?, ?, ?, ?);");
	
	log ("reading the roots");
	const theTree = odbHome.loadFolder (folderOdb, log);
	
	var ctRows = 0;
	
	const writeTree = theDatabase.transaction (function (theTable, parentId) {
		Object.keys (theTable).forEach (function (name) {
			const theValue = theTable [name];
			const theType = flPlainTable (theValue) ? "table" : valueType (theValue);
			const theId = insert.run (parentId, name, String (name).toLowerCase (), theType, encodeValue (theValue, theType)).lastInsertRowid;
			ctRows++;
			if (theType === "table") {
				writeTree (theValue, theId);
				}
			});
		});
	
	log ("writing rows");
	writeTree (theTree, idRoot);
	
	log (ctRows + " rows written to " + pathDatabase);
	theDatabase.close ();
	return (ctRows);
	}

function openDatabase (pathDatabase) {
	
	/*  Open a built database and hand back a root table. Children
		materialize on access -- a table is a proxy over the rows whose
		parentid is its own, so the database is never all in memory.  */
	
	const sqlite3 = requireSqlite ();
	const theDatabase = new sqlite3 (pathDatabase);
	theDatabase.pragma ("journal_mode = WAL");
	theDatabase.exec (createScript);
	
	const selectChildren = theDatabase.prepare ("select name from odb where parentid = ? order by lowername;");
	const selectChild = theDatabase.prepare ("select id, name, type, value from odb where parentid = ? and lowername = ?;");
	const insertChild = theDatabase.prepare ("insert into odb (parentid, name, lowername, type, value) values (?, ?, ?, ?, ?);");
	const updateChild = theDatabase.prepare ("update odb set type = ?, value = ? where id = ?;");
	const deleteById = theDatabase.prepare ("delete from odb where id = ?;");
	
	const proxyCache = new Map (); //one proxy per id, so identity holds across reads
	
	function removeSubtree (theId) { //a table's children go with it
		selectChildren.all (theId).forEach (function (row) {
			const child = selectChild.get (theId, String (row.name).toLowerCase ());
			if (child !== undefined) {
				removeSubtree (child.id);
				}
			});
		deleteById.run (theId);
		proxyCache.delete (theId);
		}
	
	function writeValue (parentId, name, theValue) { //set an entry, replacing whatever was there
		const existing = selectChild.get (parentId, String (name).toLowerCase ());
		const theType = flPlainTable (theValue) ? "table" : valueType (theValue);
		const theColumn = encodeValue (theValue, theType);
		var theId;
		if (existing === undefined) {
			theId = insertChild.run (parentId, name, String (name).toLowerCase (), theType, theColumn).lastInsertRowid;
			}
		else {
			theId = existing.id;
			if (existing.type === "table") { //replacing a table drops what was under it
				selectChildren.all (theId).forEach (function (row) {
					const child = selectChild.get (theId, String (row.name).toLowerCase ());
					if (child !== undefined) {
						removeSubtree (child.id);
						}
					});
				proxyCache.delete (theId);
				}
			updateChild.run (theType, theColumn, theId);
			}
		if (theType === "table") {
			const source = theValue;
			Object.keys (source).forEach (function (childName) {
				writeValue (theId, childName, source [childName]);
				});
			}
		return (theId);
		}
	
	function readChild (parentId, name) {
		const row = selectChild.get (parentId, String (name).toLowerCase ());
		if (row === undefined) {
			return (undefined);
			}
		if (row.type === "table") {
			return (tableForId (row.id));
			}
		return (decodeValue (row.value, row.type));
		}
	
	function tableForId (theId) {
		
		if (proxyCache.has (theId)) {
			return (proxyCache.get (theId));
			}
		
		const target = {flOdbSqlTable: true, odbId: theId};
		
		const handler = {
			
			ownKeys: function () {
				const keys = [];
				selectChildren.all (theId).forEach (function (row) {
					keys.push (row.name);
					});
				return (keys);
				},
			
			getOwnPropertyDescriptor: function (theTarget, name) {
				if (typeof name !== "string") {
					return (undefined);
					}
				const row = selectChild.get (theId, name.toLowerCase ());
				if (row === undefined) {
					return (undefined);
					}
				return ({enumerable: true, configurable: true, writable: true, value: readChild (theId, name)});
				},
			
			has: function (theTarget, name) {
				if ((name === "flOdbSqlTable") || (name === "odbId")) {
					return (true);
					}
				if (typeof name !== "string") {
					return (false);
					}
				return (selectChild.get (theId, name.toLowerCase ()) !== undefined);
				},
			
			get: function (theTarget, name) {
				if ((name === "flOdbSqlTable") || (name === "odbId")) {
					return (theTarget [name]);
					}
				if (typeof name !== "string") { //Symbol.toPrimitive and friends
					return (undefined);
					}
				return (readChild (theId, name));
				},
			
			set: function (theTarget, name, theValue) {
				writeValue (theId, String (name), theValue);
				return (true);
				},
			
			deleteProperty: function (theTarget, name) {
				const row = selectChild.get (theId, String (name).toLowerCase ());
				if (row !== undefined) {
					removeSubtree (row.id);
					}
				return (true);
				}
			};
		
		const theProxy = new Proxy (target, handler);
		proxyCache.set (theId, theProxy);
		return (theProxy);
		}
	
	return ({
		odb: tableForId (idRoot),
		close: function () {
			theDatabase.close ();
			},
		countRows: function () {
			return (theDatabase.prepare ("select count (*) as ct from odb;").get ().ct);
			}
		});
	}

exports.buildDatabase = buildDatabase;
exports.openDatabase = openDatabase;
