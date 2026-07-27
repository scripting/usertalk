# usertalk

The UserTalk language, running on Node.

UserTalk is the scripting language of [UserLand Frontier](http://frontier.userland.com/). This package is a clean-room implementation built from the Frontier kernel's own grammar (langparser.y) and evaluator (langevaluate.c) -- a tokenizer and parser that turn UserTalk script outlines into ASTs, a tree-walking evaluator with Frontier's semantics, and a verb library that maps the built-in verbs onto Node.

It runs against real object databases through [frontierOdb](https://github.com/scripting/frontierOdb) -- the ODB is the global namespace, dotted paths resolve case-insensitively, addresses are live references, and a path that lands on a script parses it on first call and calls it. Your old code runs on your old data.

### Status

Born 7/27/2026 from an overnight research run that asked: can decades of Frontier build scripts run unchanged on a modern machine? The answer was yes:

1. **Parse rate: 100%** over both corpora tried -- 361 of 361 build scripts, and 749 of 749 scripts of a production suite (~33,000 lines of UserTalk written across four decades).
2. **336 of 361 build scripts execute clean** against the real object database, with a dry-run file layer.
3. **The end-to-end proof:** a real build script ran unchanged -- outline rendered to files, the script's own copyone handler executing real file verbs -- and produced a folder byte-identical to what Frontier ships, 6 of 6 files.

### What's real and what's stubbed

Real: the language (handlers, loops, with, case, try, addresses, local/global scoping, the operator set), file.* over the filesystem behind a Mac-colon-path map, string.*, clock/date, typeof/sizeof/defined/nameof/new, and ODB scripts as callable values.

Stubs, loud ones -- every unimplemented verb announces itself, nothing silently succeeds: op.*, target.*, wp.*, xml.*, s3.*, tcp.*. The plan is to make them real as working scripts need them.

### Running a script

```
node code/run.js examples/hello/hello.opml
```

Runs one script outline; add `--trace` to see every verb call. Start in [examples](examples/) -- each one is a working UserTalk program with a readme. `runAll.js` runs a whole folder of scripts and writes a report naming exactly which verbs each failing script needs -- that report is the work list.

### The repo

- **code/** -- the interpreter.
	- **parse.js** -- tokenizer and recursive-descent parser, grammar from langparser.y.
	- **evaluate.js** -- the evaluator, semantics from langevaluate.c.
	- **verbs.js** -- the verb library.
	- **odbLoader.js** -- loads .root and .fttb files into the namespace via frontierOdb.
	- **usertalk.js** -- the package front door.
	- **run.js / runAll.js / parseAll.js / parseSuite.js** -- runners and corpus tests.
- **examples/** -- working UserTalk programs to run and crib from.
- **source.opml** -- the whole package as one outline, for reading in an outliner. Generated from the files; every file renders back from it byte-identical.

The research run that produced all this -- the report, the verb-surface survey of every verb called across the corpus, and the harness that renders projects from the ODB -- is preserved in misc/research/.

***

*By Claude Code, with Dave Winer driving. UserTalk and Frontier by Dave Winer, UserLand Software.*
