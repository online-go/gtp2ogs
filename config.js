// vim: tw=120 softtabstop=4 shiftwidth=4

// see: https://github.com/online-go/gtp2ogs/blob/devel/docs/DEV.md#no-console-eslint-rule-in-configjs
/* eslint-disable no-console */

const { getArgNamesGRU } = require('./options/getArgNamesGRU');
const { getOptionName } = require('./options/getOptionName');
const { getRankedUnranked } = require('./options/getRankedUnranked');
const { getRankedUnrankedUnderscored } = require('./options/getRankedUnrankedUnderscored');

const { droppedOptions, ogsPvAIs, rankedUnrankedOptions } = require('./constants');

exportInitialConfig();

exports.updateFromArgv = function(argv) {
    // console messages
    // A- greeting and debug status

    const debugStatus = argv.debug ? "DEBUG: ON\n" : "";
    console.log(`\ngtp2ogs version 6.0.1\n--------------------\n- For changelog or latest devel updates, please visit https://github.com/online-go/gtp2ogs/tree/devel\n${debugStatus}`);

    // B - throw errors

    // all errors should be tested and thrown before we start exporting.
    // For example, if a minrank option is used we first export it like all other
    // used argv options.
    // but then when adjusting argv exports (ex: to parse rank), minrank arg value
    // is tested false (ex: "", null) in processRankExport, so we don't enter the code
    // that throws an error inside parseRank, thus exporting an invalid rank ""
    // so throwing all errors before doing any export avoids to run in such a case, and
    // is also perhaps easier to handle

    testBotCommandArgvIsValid(argv);
    testDroppedArgv(droppedOptions, argv);
    testConflictingOptions("rankedonly", "unrankedonly", argv);
    testConflictingOptions("persist", "persistnoncorr", argv);
    testConflictingOptions("rejectnew", "rejectnewfile", argv);
    ensureSupportedOgspvAI(argv.ogspv, ogsPvAIs);
    testRankedUnrankedOptions(rankedUnrankedOptions, argv);
    testMinMaxRanksAreValid(argv);

    // C - set general/ranked/unranked options defaults
    
    // For general/ranked/unranked options, do not add a default using .default of yargs, add it later in the
    // code if no ranked arg nor unranked arg are used, else we would be force using the general arg regardless of
    // botadmin using the ranked and/or unranked arg(s), triggering the no 3 args at the same time error.

    setRankedUnrankedOptionsDefaults(rankedUnrankedOptions, argv);

    // EXPORTS FROM ARGV
    // 0) Export everything in argv first

    for (const k in argv) {
        exports[k] = argv[k];
    }

    // 1) Add and Modify/Adjust exports

    if (argv.debug) {
        exports.DEBUG = true;
    }
    if (argv.logfile !== undefined) {
        exportLogfileFilename(argv.logfile, argv.debug);
    }
    exportSecondsAsMilliseconds("timeout", argv);
    exportSecondsAsMilliseconds("startupbuffer", argv);

    if (argv.beta) {
        exports.host = 'beta.online-go.com';
    }

    exportNoAutoHandicapsIfMinHandicapsArePositive(argv);

    if (argv.ogspv) {
        exports.ogspv = argv.ogspv.toUpperCase();
    }
    if (argv.rejectnew) {
        // A bot never accepting new games shouldn't be appearing in the dropdown, polite to our users.
        exports.hidden = true;
    }
    exports.bot_command = argv._;

    // 2) specific ranked/unranked options exports

    exportMinMaxRanks(argv);
    exportBans(argv);
    exportAllowedGroups(argv);

    // console messages
    // C - test exports warnings

    warnIfNopauseIsMissing("ranked");
    warnIfNopauseIsMissing("unranked");
    console.log("\n");

}

function exportInitialConfig() {
    exportInitialConfigUnderscored("");
    exportInitialConfigUnderscored("_ranked");
    exportInitialConfigUnderscored("_unranked");

    exports.start_date = new Date();
}

function exportInitialConfigUnderscored(rankedUnrankedUnderscored) {
    exports[`banned_users${rankedUnrankedUnderscored}`] = {};
    exports[`allow_all_boardsizes${rankedUnrankedUnderscored}`] = false;
    exports[`allowed_boardsizes${rankedUnrankedUnderscored}`] = [];
    exports[`allow_all_komis${rankedUnrankedUnderscored}`] = false;
    exports[`allowed_komis${rankedUnrankedUnderscored}`] = [];
    exports[`allowed_speeds${rankedUnrankedUnderscored}`] = {};
    exports[`allow_all_speeds${rankedUnrankedUnderscored}`] = false;
    exports[`allowed_timecontrols${rankedUnrankedUnderscored}`] = {};
    exports[`allow_all_timecontrols${rankedUnrankedUnderscored}`] = false;
}

function testRankedUnrankedOptions(rankedUnrankedOptions, argv) {
    for (const option of rankedUnrankedOptions) {
        const [general, ranked, unranked] = getArgNamesGRU(option.name);
        
        // check undefined specifically to handle valid values such as 0 or null which are tested false
        if (argv[general] !== undefined) {
            if (argv[ranked] !== undefined) {
                throw `Cannot use --${general} and --${ranked} at the same time.\nFor ranked games, use either --${general} or --${ranked}, or do not use anything to switch to default settings for this option.`;
            }
            if (argv[unranked] !== undefined) {
                throw `Cannot use --${general} and --${unranked} at the same time.\nFor unranked games, use either --${general} or --${unranked}, or do not use anything to switch to default settings for this option.`;
            }
        }
    }
}

function testBotCommandArgvIsValid(argv) {
    if (argv._ === undefined) {
        throw "Missing bot command.";
    }

    const parsedBotCommand = JSON.stringify(argv._);

    if (!Array.isArray(argv._)) {
        throw `Bot command (detected as ${parsedBotCommand}) was not correctly parsed as an array of parameters, please check your syntax ( -- ).`;
    }
    if (argv._.length === 0) {
        throw `Bot command (detected as ${parsedBotCommand}) cannot be empty, please use at least one element in your bot command which should be the AI executable (ex: lz.exe).`;
    }
}

function testDroppedArgv(droppedOptions, argv) {
    for (const [oldNames, newName] of droppedOptions) {
        for (const oldName of oldNames) {
            if (argv[oldName]) {
                if (newName !== undefined) throw `Dropped: --${oldName} is no longer supported, use --${newName} instead.`;
                throw `Dropped: --${oldName} is no longer supported.`;
            }
        }
    }
    for (const argName of getArgNamesGRU("komis")) {
        if (argv[argName]) {
            for (const komi of ["auto","null"]) {
                if (argv[argName].split(",").includes(komi)) {
                    throw `Dropped: --${argName} ${komi} is no longer supported, use --${argName} automatic instead`;
                }
            }
        }
    }
}

function testConflictingOptions(optionNameFirst, optionNameSecond, argv) {
    if (argv[optionNameFirst] && argv[optionNameSecond]) {
        throw `Please choose either --${optionNameFirst} or --${optionNameSecond}, not both.`;
    }
}

function ensureSupportedOgspvAI(ogspv, ogsPvAIs) {
    // being case tolerant
    if (!ogspv) return;
    const upperCaseOgsPv = ogspv.toUpperCase();
    const upperCaseAIs   = ogsPvAIs.map(e => e.toUpperCase());

    if (!upperCaseAIs.includes(upperCaseOgsPv)) {
        throw `Unsupported --ogspv option ${ogspv}.\nSupported options are ${ogsPvAIs.join(', ')}`;
    }
}

function setRankedUnrankedOptionsDefaults(rankedUnrankedOptions, argv) {
    for (const option of rankedUnrankedOptions) {
        if (!("default" in option)) continue;
        
        const [general, ranked, unranked] = getArgNamesGRU(option.name);

        if (argv[general] === undefined) {
            if ((argv[ranked] === undefined) && (argv[unranked] === undefined)) {                
                argv[general] = option.default;
            } else if (argv[ranked] !== undefined && argv[unranked] === undefined) {
                // also set the opposite arg currently undefined to the default, more convenient for botadmin
                argv[unranked] = option.default;

            } else if (argv[ranked] === undefined && argv[unranked] !== undefined) {
                // also set the opposite arg currently undefined to the default, more convenient for botadmin
                argv[ranked] = option.default;
            }
        }
    }
}

function getRankMatchResults(arg) {
    const re = /(\d+)([kdp])/;
    const results = arg.toLowerCase().match(re);	

    return results;
}

function testMinMaxRankIsValid(optionName, argv) {
    const arg = argv[optionName];
  
    if (arg !== undefined) {
        if (typeof arg !== "string") {
            throw new Error(`Error: ${arg} is of invalid type, should be string but is ${typeof arg}.`);
        }

        const results = getRankMatchResults(arg);
        if (!results) {
            throw new Error(`Error: could not parse rank ${arg}.`);
        }
    }
}

function testMinMaxRanksAreValid(argv) {
    testMinMaxRankIsValid("minrank", argv);
    testMinMaxRankIsValid("minrankranked", argv);
    testMinMaxRankIsValid("minrankunranked", argv);
    testMinMaxRankIsValid("maxrank", argv);
    testMinMaxRankIsValid("maxrankranked", argv);
    testMinMaxRankIsValid("maxrankunranked", argv);
}

function getLogfileFilename(argvLogfile) {
    return (argvLogfile === "" ? `gtp2ogs-logfile-${exports.start_date.toISOString()}` : argvLogfile);
}

function getValidFilename(filename) {
    // convert any other character than letters (A-Z a-z), numbers (0-9), hypens (-), underscore (_),
    // space ( ), dot (.) to a hyphen (-)
    return filename.replace(/[^\w\-. ]/g, "-");
}

function exportSecondsAsMilliseconds(optionName, argv) {
    if (argv[optionName] !== undefined) {
        // Convert some times in seconds to milliseconds once here so we don't need
        // to do it each time it is used later.
        exports[optionName] = argv[optionName] * 1000;
    }
}

function exportNoAutoHandicapIfMinHandicapIsPositive(rankedUnranked, argv){
    // Setting minimum handicap higher than -1 has the consequence of rejecting
    // challenge that have automatic handicap in connection.js (-1 lower than
    // minimum handicap 0 or higher, rejecting challenge)

    if (argv[`minhandicap${rankedUnranked}`] > -1) {
        exports[`noautohandicap${rankedUnranked}`] = true;
    }
}

function exportNoAutoHandicapsIfMinHandicapsArePositive(argv) {
    exportNoAutoHandicapIfMinHandicapIsPositive("", argv);
    exportNoAutoHandicapIfMinHandicapIsPositive("ranked", argv);
    exportNoAutoHandicapIfMinHandicapIsPositive("unranked", argv);
}

function exportLogfileFilename(argvLogfile, argvDebug) {
    const filename = getLogfileFilename(argvLogfile);
    const validFilename = getValidFilename(filename);
    
    if (argvDebug && filename !== validFilename) {
        console.log (`Logfile name "${filename}" has been automatically renamed to "${validFilename}".\nValid logfile name can only be composed of letters (A-Z a-z), numbers (0-9), hyphens (-), underscores (_), spaces ( ), dots (.).\n`);
    }

    exports.logfile = validFilename;
}

function parseRank(arg) {
    const results = getRankMatchResults(arg);

    if (results[2] === "k") {
        return (30 - parseInt(results[1]));
    } else if (results[2] === "d") {
        return (30 - 1 + parseInt(results[1]));
    } else if (results[2] === "p") {
        return (36 + parseInt(results[1]));
    }
}

function processRankExport(argName, argv) {
    const arg = argv[argName];
    if (arg) {
        exports[argName] = parseRank(arg);
    }
}

function exportMinMaxRanks(argv) {
    processRankExport("minrank", argv);
    processRankExport("minrankranked", argv);
    processRankExport("minrankunranked", argv);

    processRankExport("maxrank", argv);
    processRankExport("maxrankranked", argv);
    processRankExport("maxrankunranked", argv);
}

function processBansExport(argName, argv) {
    const arg = argv[argName];
    const rankedUnrankedUnderscored = getRankedUnrankedUnderscored(argName);

    if (arg) {
        const bans = arg.split(',');
        for (const bannedUser of bans) {
            exports[`banned_users${rankedUnrankedUnderscored}`][bannedUser] = true;
        }
    }
}

function exportBans(argv) {
    processBansExport("bans", argv);
    processBansExport("bansranked", argv);
    processBansExport("bansunranked", argv);
}

function processBoardsizesExport(argName, argv) {
    const arg = argv[argName];

    if (arg) {
        const rankedUnranked = getRankedUnranked(argName);
        const rankedUnrankedUnderscored = getRankedUnrankedUnderscored(rankedUnranked);
        const boardsizes = arg.split(',');
        for (const boardsize of boardsizes) {
            if (boardsize === "all") {
                exports[`allow_all_boardsizes${rankedUnrankedUnderscored}`] = true;
            } else {
                exports[`allowed_boardsizes${rankedUnrankedUnderscored}`][boardsize] = true;
            }
        }
    }
}

function processKomisExport(argName, argv) {
    const arg = argv[argName];

    if (arg) {
        const rankedUnranked = getRankedUnranked(argName);
        const rankedUnrankedUnderscored = getRankedUnrankedUnderscored(rankedUnranked);
        const komis = arg.split(',');
        for (const komi of komis) {
            if (komi === "all") {
                exports[`allow_all_komis${rankedUnrankedUnderscored}`] = true;
            } else if (komi === "automatic") {
                exports[`allowed_komis${rankedUnrankedUnderscored}`][null] = true;
            } else {
                exports[`allowed_komis${rankedUnrankedUnderscored}`][komi] = true;
            }
        }
    } 
}

function processAllowedGroupExport(argName, argv) {
    const arg = argv[argName];

    if (arg) {
        const optionName = getOptionName(argName);
        const rankedUnranked = getRankedUnranked(argName);
        const rankedUnrankedUnderscored = getRankedUnrankedUnderscored(rankedUnranked);
        const allowedValues = arg.split(',');
        for (const allowedValue of allowedValues) {
            if (allowedValue === "all") {
                exports[`allow_all_${optionName}${rankedUnrankedUnderscored}`] = true;
            } else {
                exports[`allowed_${optionName}${rankedUnrankedUnderscored}`][allowedValue] = true;
            }
        }
    } 
}

function exportAllowedGroups(argv) {
    processBoardsizesExport("boardsizes", argv);
    processBoardsizesExport("boardsizesranked", argv);
    processBoardsizesExport("boardsizesunranked", argv);

    processKomisExport("komis", argv);
    processKomisExport("komisranked", argv);
    processKomisExport("komisunranked", argv);

    processAllowedGroupExport("speeds", argv);
    processAllowedGroupExport("speedsranked", argv);
    processAllowedGroupExport("speedsunranked", argv);

    processAllowedGroupExport("timecontrols", argv);
    processAllowedGroupExport("timecontrolsranked", argv);
    processAllowedGroupExport("timecontrolsunranked", argv);
}

function warnIfNopauseIsMissing(rankedUnranked) {
    // avoid infinite games
    if (!exports.nopause && !exports[`nopause${rankedUnranked}`]) {
        console.log(`Warning: No --nopause nor --nopause${rankedUnranked}, ${rankedUnranked} games are likely to last forever`); 
    }
}
