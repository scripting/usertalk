#### 8/8/26; 6:45:00 PM by CC

thread.callscript is a verb now, an alias of lang.callscript -- it runs the script synchronously rather than on a thread, which is the honest version of what this interpreter can do. It's the first line of every button script in nodeEditor's buttons table, so without it no button could reach its suite script. Version 0.3.3.

#### 8/8/26; 3:15:00 PM by CC

Menubars decode now. frontierodb 0.3.0 reads both storage forms -- the packed form a fat page carries (a savedmenuinfo record, the menubar outline, then the linked scripts one packed outline after another, matched to their lines in pre-order) and the database form (an info record whose dbaddresses point at the outline and at each script's own block). The struct sizes aren't hard-coded; the decoder finds the offset where the header's size fields account for the data exactly. Proven on DW's export of user.menus.customMenu -- 542 lines, 422 of them carrying scripts -- and on the two menubars inside nodeEditor.root that used to come through as markers.

On this side, odbHome mounts .ftmb exports like the other fat pages, and odbSql stores a menubar as its own row type -- the lines as JSON, each command's script riding along -- and hands it back as a value the evaluator can tell from a table. Version 0.3.2.

#### 8/8/26; 11:30:00 AM by CC

The language constants no longer persist into the database. installConstants wrote ~50 entries -- tabletype, addresstype, cr, tab and friends -- into the root of any SQL odb the first time a script ran; they showed up as real rows at the top of the odb browser. Now the evaluator resolves them at lookup time, after the database and before the paths fallback -- the same precedence they always had -- and writes nothing. Assigning to a constant's name still creates a real root entry, which wins from then on.

Same treatment for temp: it used to be copied into the root at boot, and through the SQL proxy the copy was a separate subtree -- temp.x and system.temp.x silently diverged. Now temp resolves to system.temp itself, the way Frontier's paths table does it. system.environment and system.temp still persist; those tables really exist in Frontier. Version 0.3.1.

#### 8/7/26; 3:05:18 PM by CC

Researched how the object database works at the next level up -- guest databases, which arrived experimentally in Frontier 5.0 and were declared ready to build on in 5.1.4. The kernel defines a guest as a root file whose root has no system table; open guests are tracked in the compiler files table and addressed with the bracketed-filename syntax; by the OPML Editor era the guest database had become the packaging for an app, with the loader scanning the Tools folder and knowing the special top-level names. Write-up with sources: misc/research/guestDatabases.md.

#### 8/7/26; 1:35:41 PM by CC

The nodeEditorSuite folder helpers -- getFolder, getAllServersFolder, getGitHubFolder -- now register only when the path map actually supplies a value. They used to register unconditionally, which meant the real scripts at those addresses in the database never ran: DW edited nodeEditorSuite.getAllServersFolder and his change had no effect, because the helper verb shadowed it. With no helper configured, the call falls through to the script. Applied surgically to marin's copy the same day.

Also: misc/buildSourceOpml.js was missing code/s3helper.js from its file list, so a rebuild silently dropped that file from source.opml. Caught by the file count, fixed. source.opml verifies 22 for 22.

#### 8/5/26; 11:59:00 PM by CC

Manila week. Five real interpreter bugs found by running Manila and fixed: nameOf mangled names containing dots (Manila keys members by email address); @x == @x compared JS objects instead of the paths they name; string (address) answered "[object Object]"; mrcalendar.getmostrecentday and date.set were missing. Full findings in misc/manilaFindings20260805.md.

The three s3 verbs -- s3.newobject, s3.getobject, s3.objectexists -- are real, built on daveS3. UserTalk is synchronous and daveS3 isn't, so each verb runs code/s3helper.js in a child process: JSON in on stdin, JSON out on stdout, daveS3's console narration diverted to stderr. Proven against the live bucket from marin. Watch the ACLs: the allservers bucket refuses public-read.

#### 8/4/26; 5:30:00 PM by CC

Shipped 0.3.0 to marin, and the first real build ran there -- DW's own uploadScripts and buildSallyReader, unmodified. Three interpreter bugs found on the way: parseNameList var-hoisting made locals inherit each other's values; the XML round trip cut tags at a > inside a quoted attribute and dropped processing instructions; and findValueHome walked the entire database on every parentOf -- fixing it took a build from 25 seconds to 160 milliseconds.

New verbs: string.multiplereplaceall, xml.opml.getbodyaddress, op.outlinetoxml, html.directory.getrawhtml. evaluate as a special form.

Known limitation, told to DW, left alone: the file verbs read and write latin1, so characters above U+00FF corrupt on the way through.

#### 7/28/26; 6:00:00 PM by CC

The object database went to SQL, one way -- odbSql.js builds a SQLite database from a folder of roots (odbHome.js defines the folder rules), and tables materialize lazily through proxies, so the database is never all in memory. Nothing ever goes back to the odb format. wptext decoded too, in frontierodb.

#### 7/27/26; 12:00:00 PM by CC

The package exists: parser, evaluator, and verb library for UserTalk, the scripting language of UserLand Frontier, running on node. The 7/26 overnight study set the discipline: run beside Frontier, diff byte-for-byte, believe nothing else. 361 of 361 build scripts parse; 336 execute against the real odb.
