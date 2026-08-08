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
