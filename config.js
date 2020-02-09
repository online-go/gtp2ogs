// vim: tw=120 softtabstop=4 shiftwidth=4

const fs = require('fs')
const console = require('console');

const checkArgs = ["rejectnew",
                   "booleans_root",
                   "max_root",
                   "boolean_args_RU",
                   "min_max_args_RU",
                   "comma_separated_RU"];
checkArgs.forEach( str => exports[`check_${str}`] = function() {} );

exports.updateFromArgv = function() {
    const optimist = require("optimist")
        // 1) ROOT ARGUMENTS:
        //     A) CHALLENGE-UNRELATED ARGS:
        //         A1) ROOT:
        .usage("Usage: $0 --username <bot-username> --apikey <apikey> [arguments] -- botcommand [bot arguments]")
        .demand('username')
        .demand('apikey')
        .describe('username', 'Specify the username of the bot, for example GnuGo')
        .describe('apikey', 'Specify the API key for the bot')
        .describe('greeting')
        .string('greeting')
        .describe('farewell', 'Thank you message to appear in chat at end of game (ex: -Thank you for playing-)')
        .string('farewell')
        .describe('rejectnewmsg', 'Adds a customized reject message included in quote your message quote')
        .default('rejectnewmsg', 'Currently, this bot is not accepting games, try again later ')
        .describe('debug', 'Output GTP command and responses from your Go engine')
        .describe('logfile', 'In addition to logging to the console, also log gtp2ogs output to a text file')
        .describe('json', 'Send and receive GTP commands in a JSON encoded format')
        .describe('beta', 'Connect to the beta server (sets ggs/rest hosts to the beta server)')
        .describe('host', 'OGS Host to connect to')
        .default('host', 'online-go.com') // default to OGS. If --beta, host will switch to beta OGS automatically
        .describe('port', 'OGS Port to connect to')
        .default('port', 443)
        .describe('insecure', 'Do not use ssl to connect to the ggs/rest servers')
        .describe('hidden', 'Hides the botname from the OGS game -Play against computer- bot list (but it can still accept challenges)')
        .describe('startupbuffer', 'Subtract this many seconds from time available on first move')
        .default('startupbuffer', 5)
        .describe('timeout', 'Disconnect from a game after this many seconds (if set)')
        .default('timeout', 0)
        // TODO: Test known_commands for kgs-time_settings to set this, and remove the command line option
        .describe('kgstime', 'Set this if bot understands the kgs-time_settings command')
        .describe('showboard', 'Set this if bot understands the showboard GTP command, and if you want to display the showboard output')
        .describe('persist', 'Bot process remains running between moves')
        .describe('noclock', 'Do not send any clock/time data to the bot')
        .describe('corrqueue', 'Process correspondence games one at a time')
        .describe('fakebotrank', 'Fake bot ranking to calculate automatic handicap stones number in autohandicap (-1) based on rankDifference'
                                 + 'between fakebotrank and user ranking, to fix the bypass minhandicap maxhandicap issue')
        //         A2) RANKED/UNRANKED:
        /* note: - nopause allows to disable pauses DURING games, (game.js), but
        /        - nopauseonweekends rejects challenges BEFORE games (connection.js)
        /          (only for correspondence games)*/
        .describe('nopause', 'Do not allow pauses during games for ranked / unranked games')
        //     B) CHECK CHALLENGE ARGS
        .describe('rejectnew', 'Reject all new challenges with the default reject message')
        .describe('rejectnewfile', 'Reject new challenges if file exists (checked each time, can use for load-balancing)')
        /* note: for maxconnectedgames, correspondence games are currently included
        /  in the maxconnectedgames count if you use `--persist` )*/
        .describe('maxconnectedgames', 'Maximum number of connected games for all users')
        .default('maxconnectedgames', 20)
        .describe('maxconnectedgamesperuser', 'Maximum number of connected games per user against this bot')
        .default('maxconnectedgamesperuser', 3)
        .describe('rankedonly', 'Only accept ranked matches')
        .describe('unrankedonly', 'Only accept unranked matches')
        /* ranked games can't be private (public only), no need for --publiconlyranked nor --privateonlyranked,
        /  nor their unranked args since the general argument is for unranked games too*/
        .describe('privateonly', 'Only accept private matches')
        .describe('publiconly', 'Only accept public (non-private) matches')
        // 2) CHECK CHALLENGE ARGS RANKED/UNRANKED:
        //     A) COMMA-SEPARATED FAMILIES RANKED/UNRANKED:
        //         A1) NUMBER FAMILIES:
        .describe('boardsizes', 'Board size(s) square (if --boardsizeheights is not specified), '
                                + 'or board size width(s) (if it is specified), '
                                + 'to accept for ranked / unranked games')
        .string('boardsizes')
        .default('boardsizes', '9,13,19/...')
        .describe('boardsizeheights', 'Allows non square boardsizes if specified, and specifies '
                                      + 'Board size height(s) to accept for ranked / unranked games')
        .string('boardsizeheights')
        .describe('komis', 'Allowed komi values for ranked / unranked games')
        .string('komis')
        .default('komis', 'automatic/...')
        //         A2) WORDS FAMILIES:
        .describe('bans', 'Usernames or IDs to ban from ranked / unranked games')
        .string('bans')
        .describe('rules', 'Rule(s) to accept')
        .default('rules', 'chinese/...')
        .describe('challengercolors', 'Challenger color(s) to accept for ranked / unranked games')
        .default('challengercolors', 'all/...')
        .describe('speeds', 'Game speed(s) to accept for ranked / unranked games')
        .default('speeds', 'all/...')
        .describe('timecontrols', 'Time control(s) to accept for ranked / unranked games')
        .default('timecontrols', 'fischer,byoyomi,simple,canadian/...')
        //     B) BOOLEANS RANKED/UNRANKED:
        .describe('proonly', 'For all matches, only accept those from professionals for ranked / unranked games')
        .describe('nopauseonweekends', 'Do not accept matches that come with the option -pauses in weekends-'
                                       + '(specific to correspondence games) for ranked / unranked games')
        .describe('noautohandicap', 'Do not allow handicap to be set to -automatic- for ranked / unranked games')
        .describe('boardsizeheightsnonsquareonly', 'Use this in combination with --boardsizeheights (allows non-square boardsizes '
                                                   + '(ex: 19x18 and 18x19)) to specifically reject matches with square boardsizes '
                                                   + 'combinations of widths and heights (ex:19x13, 13x19) for ranked / unranked games')
        //     C) MINMAX RANKED/UNRANKED:
        .describe('rank', 'minimum:maximum (weakest:strongest) opponent ranks to accept for ranked / unranked games (example 15k:1d/...)')
        .string('rank')
        .describe('handicap', 'minimum:maximum number of handicap stones to accept (example -1:9), -1 is automatic handicap')

        .describe('maintimeblitz', 'minimum:maximum seconds of main time for blitz games ranked / unranked')
        .default('maintimeblitz', '15:300/...') // 15 seconds : 5 minutes
        .describe('maintimelive', 'minimum:maximum seconds of main time for live games ranked / unranked')
        .default('maintimelive', '60:7200/...') // 1 minute : 2 hours
        .describe('maintimecorr', 'minimum:maximum seconds of main time for correspondence games ranked / unranked')
        .default('maintimecorr', '259200:604800') // 3 days : 7 days

        .describe('periodsblitz', 'minimum:maximum number of periods for blitz games ranked / unranked')
        .default('periodsblitz', '3:20/...')
        .describe('periodslive', 'minimum:maximum number of periods for live games ranked / unranked')
        .default('periodslive', '3:20/...')
        .describe('periodscorr', 'minimum:maximum number of periods for correspondence games ranked / unranked')
        .default('periodscorr', '3:10/...')

        .describe('periodtimeblitz', 'minimum:maximum seconds of period time for blitz games ranked / unranked')
        .default('periodtimeblitz', '5:10/...') // 5 seconds : 10 seconds
        .describe('periodtimelive', 'minimum:maximum seconds of period time for live games ranked / unranked')
        .default('periodtimelive', '10:120/...') // 10 seconds : 2 minutes
        .describe('periodtimecorr', 'minimum:maximum seconds of period time for correspondence games ranked / unranked')
        .default('periodtimecorr', '14400:259200/...') // 4 hours : 3 days
    ;

    const argv = optimist.argv;
    if (!argv._ || argv._.length === 0) {
        optimist.showHelp();
        process.exit();
    }

    // console messages
    // A- greeting and debug status //
    const debugStatus = argv.debug ? "ON" : "OFF";
    console.log(`\ngtp2ogs version 6.0`
                + `\n--------------------`
                + `\n- For changelog or latest devel updates, please visit https://github.com/online-go/gtp2ogs/tree/devel`
                + `\nDebug status: ${debugStatus}`);
                
    // B - check deprecated argv //
    const deprecatedArgvArrays = [ 
        [["bot", "id", "botid"], "username"],
        [["maxtotalgames"], "maxconnectedgames"],
        [["maxactivegames"], "maxconnectedgamesperuser"],
        deprecationsPluralSingularRU("boardsizes"),
        deprecationsPluralSingularRU("boardsizeheights"),
        [["boardsizewidths"], false],
        [["boardsizewidthsranked"], false],
        [["boardsizewidthsunranked"], false],
        deprecationsPluralSingularRU("komis"),
        deprecationsPluralSingularRU("bans"),
        deprecationsPluralSingularRU("speeds"),
        deprecationsPluralSingularRU("timecontrols"),
        minMaxDeprecationsRU("rank"),
        minMaxDeprecationsRU("handicap"),
        minMaxDeprecationsBlitzLiveCorrRU("maintime"),
        minMaxDeprecationsBlitzLiveCorrRU("periods"),
        minMaxDeprecationsBlitzLiveCorrRU("periodtime")
    ];
    for (const deprecatedArgvArray of deprecatedArgvArrays) {
        const [oldNames, newNameMsg] = deprecatedArgvArray;
        for (const oldName of oldNames) {
            if (argv[oldName]) {
                const beginning = `Deprecated: --${oldName} is no longer supported`;
                const ending = `see all supported options list for details:
                                \nhttps://github.com/online-go/gtp2ogs/blob/devel/docs/OPTIONS-LIST.md`
                if (newNameMsg) {
                    throw new `${beginning}, use --${newNameMsg} instead, ${ending}`;
                } else {
                    throw new `${beginning}, ${ending}`;
                }
            }
        }
    }
    if (argv.komis.includes("null")) {
        throw new 'Deprecated: komis /null/ is no longer supported, '
                  + 'use /automatic/ instead';
    }
    console.log("\n");

    // include "nopause" here to be able to do a functionnal check on argv ranked/unranked
    const full_ranked_unranked_argNames = ["boardsizes", "boardsizeheights",
        "komis", "rules", "challengercolors", "speeds", "timecontrols",
        "proonly", "noautohandicap", "nopauseonweekends", "nopause",
        "boardsizeheightsnonsquareonly",
        "rank", "handicap",
        "maintimeblitz", "maintimelive","maintimecorr",
        "periodsblitz", "periodslive", "periodscorr",
        "periodtimeblitz", "periodtimelive", "periodtimecorr"];

    const full_check_challenge_root_argNames = ["rejectnew", "rejectnewfile",
        "maxconnectedgames", "maxconnectedgamesperuser",
        "rankedonly", "unrankedonly", "privateonly", "publiconly"];

    // EXPORTS FROM argv //
    // 0) root, challenge unrelated exports exports
    for (const k in argv) {
        if (!full_ranked_unranked_argNames.includes(k) &&
            !full_check_challenge_root_argNames.includes(k)) {
            // Add and Modify exports
            if (k === "host" && argv.beta) {
                exports[k] = 'beta.online-go.com';
            } else if (["timeout","startupbuffer"].includes(k)) {
                // Convert some times to microseconds once here so
                // we don't need to do it each time it is used later.
                exports[k] = argv[k] * 1000;
            } else if (k === "debug") {
                // TODO: remove either of these, DEBUG or debug
                exports.DEBUG = argv.debug;
                exports[k] = argv[k];
            } else if (k === "_") {
                exports.bot_command = argv[k];
            } else if (k === "fakebotrank") {
                exports[k] = parseRank(argv[k]);
            } else {
                exports[k] = argv[k];
            }
        }
    }

    // ARGV FUNCTIONNAL CHECKS EXPORTS
    // 1) root args:
    exports.check_rejectnew = function () 
    {
        if (argv.rejectnew)  return { reject: true };
        if (argv.rejectnewfile && fs.existsSync(argv.rejectnewfile))  return { reject: true };
        return { reject: false };
    };

    exports.check_booleans_root = function (notif, familyNameString)
    {
        return { reject: argv[familyNameString] && notif };
    }

    exports.check_max_root = function (notif, familyNameString)
    {
        const maxAllowed = argv[familyNameString];
        return { reject: notif > maxAllowed,
                 maxAllowed };
    }

    // 2) ranked/unranked args:
    exports.check_boolean_args_RU = function (notif, rankedStatus, familyNameString)
    {
        const allowed = argObjectRU(argv[familyNameString], rankedStatus, familyNameString);
        return { reject: allowed && notif };
    }

    exports.check_min_max_args_RU = function (notif, rankedStatus, familyNameString)
    {
        const args = argObjectRU(argv[familyNameString], rankedStatus, familyNameString);
        return minMaxReject(args, notif);
    };

    exports.check_comma_separated_RU = function (notif, rankedStatus, familyNameString)
    {
        const argsString = argObjectRU(argv[familyNameString], rankedStatus, familyNameString);
        // skip "all": everything allowed
        if (argsString !== "all") {
            if (["boardsizes", "boardsizeheights", "komis"].includes(familyNameString)) {
                // numbers families
                if (["boardsizes", "boardsizesheights"].includes(familyNameString)) {
                    // check widths or heights
                    const allArgsNumbers = allArgsNumbersFromArgsString(argsString);
                    const reject = !allArgsNumbers.includes(Number(notif));
                    const allArgsStrings = allArgsNumbers.join(', ');
                    return { reject,
                             allArgsStrings };
                } else if (String(notif) === "null") {
                    const reject = !argsString.split(',').includes("automatic");
                    return { reject,
                             argsString };
                } else {
                    const [minAllowed, maxAllowed] = minMaxNumbersFromArgsString(argsString);
                    const reject = minMaxReject(`${minAllowed}:${maxAllowed}`, notif);
                    return { reject,
                             argsString };
                }
            } else {
                // words families
                const reject = !argsString.split(',').includes(notif);
                return { reject,
                         argsString };
            }
        }
        return { reject: false };
    }
    
    // console messages
    // C - check exports warnings:
    console.log(`CHECKING WARNINGS:`
                + `\n-------------------------------------------------------`);
    let isWarning = false;
    for (const [rankedUnrankedArg, rankedUnranked] of args_strings_RU(argv.nopause)) {
        // avoid infinite games
        // TODO: if --maxpausetime gets implemented, we can remove this
        if (!rankedUnrankedArg) {
            isWarning = true;
            console.log(`    Warning: Nopause setting for ${rankedUnranked} games not detected, `
                        + `${rankedUnranked} games are likely to last forever`);
        }
    }
    // warn about potentially problematic timecontrols:
    for (const [rankedUnrankedArg, rankedUnranked] of args_strings_RU(argv.timecontrols)) {
        for (const problematicTimecontrol of ["all", "none", "absolute"]) {
            if (rankedUnrankedArg.includes(problematicTimecontrol)) {
                isWarning = true;
                console.log(`    Warning: potentially problematic time control for ${rankedUnranked} games `
                            + `detected - ${problematicTimecontrol}: may cause unwanted time management `
                            + `problems with users`);
            }
        }
    }
    if (!isWarning) console.log("[ SUCCESS ]\n");
}

// deprecations:
function deprecationsPluralSingularRU(name) {
    const nameSingular = name.slice(0, name.length - 1);
    const oldRU = ["ranked", "unranked"];
    const veryOldRU = ["", "ranked", "unranked"];

    const oldNames = oldRU.map( str => `${name}${str}` )
                          .concat(veryOldRU.map( str => `${nameSingular}${str}` ));

    const newName = `${name} min:max/min:max syntax for ranked/unranked games`;
    return [oldNames, newName];
}

function minMaxDeprecationsRU(name) {
    const oldRU = ["", "ranked", "unranked"];
    const veryOldRU = ["ranked", "unranked"];
    let oldNames = [];
    for (const minMax of ["min", "max"]) {
        oldNames = oldNames.concat(oldRU.map( str => `${minMax}${name}${str}` ))
                           .concat(veryOldRU.map( str => `${minMax}${str}${name}` ));
    } 
    const newName = `${name} min:max/min:max syntax for ranked/unranked games`;
    return [oldNames, newName];
}

function minMaxDeprecationsBlitzLiveCorrRU(name) {
    const oldRU = ["", "ranked", "unranked"];
    let oldNames = [];
    for (const minMax of ["min", "max"]) {
        oldNames = oldNames.concat(oldRU.map( str => `${minMax}${name}${str}` ));
        for (const blitzLiveCorr of ["blitz", "live", "corr"]) {
            oldNames = oldNames.concat(oldRU.map( str => `${minMax}${name}${blitzLiveCorr}${str}` ));
        }
    }
    const newNamesString = `${name}blitz, --${name}live, --${name}corr, `
                           + `with the min:max/min:max syntax for ranked/unranked games`;
    return [oldNames, newNamesString];
}

// warnings:
function args_strings_RU(arg) {
    const [ranked, unranked] = arg.split('/');
    return ( [[ranked, "ranked"],
              [unranked, "unranked"]] );
}

// ranked/unranked args:
function argObjectRU(argsString, rankedStatus, familyNameString) {
        const rankedUnrankedArgs = argsString.split('/');
        if (rankedUnrankedArgs.length !== 2) {
            throw new `Error in in ${familyNameString} : unexpected use of the `
                      + `ranked/unranked separator : expected 2 parts, not `
                      + `${rankedUnrankedArgs.length}`;
        }
        let [ranked, unranked] = rankedUnrankedArgs;
        if (unranked === "...") {
            unranked = ranked;
        }
        if (ranked === "...") {
            throw new `Error in ${familyNameString} : can't use keyword - ... - `
                      + `for the ranked setting, only for the unranked setting.`
        }
        return (rankedStatus ? ranked : unranked);
}

function parseRank(arg) {
    if (arg) {
        const re = /(\d+)([kdp])/;
        const results = arg.toLowerCase().match(re);

        if (results) {
            if (results[2] === "k") {
                return (30 - parseInt(results[1]));
            } else if (results[2] === "d") {
                return (30 - 1 + parseInt(results[1]));
            } else if (results[2] === "p") {
                return (36 + parseInt(results[1]));
            }
        } else {
            throw new `error: could not parse rank -${arg}-`;
        }
    }
}

function minMaxReject(argsString, notif) {
    const [minAllowed, maxAllowed] = argsString.split(':')
                                               .map( str => Number(str) );
    const minReject = notif < minAllowed;
    const maxReject = maxAllowed < notif;
    // if an arg is missing, Number(undefined) returns NaN,
    // and any math operation on NaN returns false (don't reject challenge)
    return { reject: minReject || maxReject,
             minReject,
             maxReject,
             minAllowed,
             maxAllowed };
}

function allArgsNumbersFromArgsString(argsString) {
    let allArgs = [];
    for (const arg of argsString.split(',')) {
        const [minRange, maxRange] = arg.split(':')
                                        .map( str => Number(str) );
        for (let i = minRange; i < maxRange; ++i) {
            allArgs.push(i)
        }
    }
    return allArgs;
}

function minMaxNumbersFromArgsString(argsString) {
    let min = Infinity;
    let max = -Infinity;
    for (const arg of argsString.split(',')) {
        if (arg.includes(':')) {
            const [minRange, maxRange] = arg.split(':')
                                            .map( str => Number(str) );
            if (minRange < min) min = minRange;
            if (maxRange > max) max = maxRange;
        } else {
            const argNumber = Number(arg);
            if (argNumber < min) min = argNumber;
            if (argNumber > max) max = argNumber;
        }
    }
    return [min, max];
}
