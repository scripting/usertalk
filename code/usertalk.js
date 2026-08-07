const myProductName = "usertalk", myVersion = "0.2.0"; //7/27/26 by CC -- the UserTalk language running on Node; born in the 7/26-27 overnight research run, named by DW 7/27

const parse = require ("./parse.js");
const evaluate = require ("./evaluate.js");
const verbs = require ("./verbs.js");
const odbLoader = require ("./odbLoader.js");
const odbHome = require ("./odbHome.js"); //7/27/26 by CC -- assemble the odb from a folder of roots and fat pages

exports.parseLine = parse.parseLine;
exports.parseOutline = parse.parseOutline;
exports.tokenize = parse.tokenize;
exports.linesToTree = parse.linesToTree;
exports.makeEnvironment = evaluate.makeEnvironment;
exports.evaluate = evaluate.evaluate;
exports.makeVerbs = verbs.makeVerbs;
exports.loadOdb = odbLoader.loadOdb;
exports.loadFolder = odbHome.loadFolder;
exports.myProductName = myProductName;
exports.myVersion = myVersion;
