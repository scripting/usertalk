/*  One S3 operation, performed and reported, then the process exits.
	
	UserTalk is synchronous -- a script says s3.newobject (path, text, type) and
	expects the object to exist on the next line -- and daveS3 is callback-based.
	Nothing in node can wait for a callback synchronously, so the verbs run this
	helper with execFileSync and read its answer off stdout. One process per
	object is the cost; correctness is what it buys.
	
	The command arrives as JSON on stdin, and the answer leaves as JSON on stdout:
		{"verb": "newobject", "path": "/bucket/key", "type": "text/html", "acl": "public-read", "data": "..."}
		{"verb": "getobject", "path": "/bucket/key"}
		{"verb": "objectexists", "path": "/bucket/key"}
	
	by CC, 8/5/26 */

/*  daveS3 narrates to the console, and stdout is where the answer goes -- one
	log line would make the JSON unparseable. Send everything it says to stderr,
	where it still shows up in the log, and keep stdout for the answer.  */
console.log = function () {
	process.stderr.write (Array.prototype.slice.call (arguments).join (" ") + "\n");
	};

const s3 = require ("daves3");

function readCommand (callback) {
	var theText = "";
	process.stdin.setEncoding ("utf8");
	process.stdin.on ("data", function (theChunk) {
		theText += theChunk;
		});
	process.stdin.on ("end", function () {
		callback (JSON.parse (theText));
		});
	}

function answer (theObject) {
	process.stdout.write (JSON.stringify (theObject));
	}

readCommand (function (theCommand) {
	switch (theCommand.verb) {
		
		case "newobject":
			s3.newObject (theCommand.path, theCommand.data, theCommand.type, theCommand.acl, function (err) {
				if (err) {
					answer ({flError: true, message: err.message});
					}
				else {
					answer ({value: true});
					}
				});
			break;
		
		case "getobject":
			s3.getObject (theCommand.path, function (err, theData) {
				if (err) {
					answer ({flError: true, message: err.message});
					}
				else {
					/*  daveS3 hands back the whole AWS response; the object's
						contents are the Body, and a UserTalk script wants the
						text, not a description of the response.  */
					answer ({value: ((theData === undefined) || (theData === null) || (theData.Body === undefined)) ? String (theData) : theData.Body.toString ("utf8")});
					}
				});
			break;
		
		case "objectexists":
			/*  daveS3 answers the metadata, or undefined when there is no such
				object. An error is also a no -- the caller asked a yes/no
				question, not for the reason.  */
			s3.getObjectMetadata (theCommand.path, function (theStats) {
				answer ({value: ((theStats !== undefined) && (theStats !== null))});
				});
			break;
		
		default:
			answer ({flError: true, message: "Can't do the S3 operation because \"" + theCommand.verb + "\" isn't one this helper knows."});
		}
	});
