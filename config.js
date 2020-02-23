// vim: tw=120 softtabstop=4 shiftwidth=4

const fs = require('fs')
const console = require('console');

const checkGetArgs = ["rejectnew",
                      "booleans_aspecific",
                      "max_aspecific",
                      "booleans_RU",
                      "min_max_RU",
                      "min_max_maintime_periods_periodtime_BLC_RU",
                      "numbers_boardsizes_comma_RU",
                      "numbers_comma_RU",
                      "words_comma_RU"];
checkGetArgs.forEach( str => exports[`check_and_get_reject_${str}`] = function() {} );

exports.updateFromArgv = function() {
    const optimist = require("optimist")
        // 1) EXPORTED ARGS:
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

        // 2) CHECK GAMES ARGS:
        //        2A) RANKED/UNRANKED:
        /* note: - nopause allows to disable pauses DURING games, (game.js), but
        /        - nopauseonweekends rejects challenges BEFORE games (connection.js)
        /          (only for correspondence games)*/
        .describe('nopause', 'Do not allow pauses during games for ranked / unranked games')
        .default('nopause', 'false/false')

        // 3) CHECK CHALLENGE ARGS:
        //     3A) ASPECIFIC:
        .describe('rejectnew', 'Reject all new challenges with the default reject message')
        .describe('rejectnewfile', 'Reject new challenges if file exists (checked each time, can use for load-balancing)')
        /* note: for maxconnectedgames, correspondence games are currently included
        /  in the maxconnectedgames count if you use `--persist` )*/
        .describe('maxconnectedgames', 'Maximum number of connected games for all users')
        .default('maxconnectedgames', 20)
        .describe('maxconnectedgamesperuser', 'Maximum number of connected games per user against this bot')
        .default('maxconnectedgamesperuser', 3)
        .describe('fakebotrank', 'Fake bot rank provided by bot admin to calculate the estimated number of handicap'
                                 + 'automatic handicap stones if handicap is -automatic- (notification.handicap === -1)')
        .describe('rankedonly', 'Only accept ranked matches')
        .describe('unrankedonly', 'Only accept unranked matches')
        /* ranked games can't be private (public only), no need for --publiconlyranked nor --privateonlyranked,
        /  nor their unranked args since the general argument is for unranked games too*/
        .describe('privateonly', 'Only accept private matches')
        .describe('publiconly', 'Only accept public (non-private) matches')
        //     3B) RANKED/UNRANKED:
        //         3B1) BOOLEANS RANKED/UNRANKED:
        .describe('proonly', 'For all matches, only accept those from professionals for ranked / unranked games')
        .default('proonly', 'false/...')
        .describe('nopauseonweekends', 'Do not accept matches that come with the option -pauses in weekends-'
                                        + '(specific to correspondence games) for ranked / unranked games')
        .default('nopauseonweekends', 'false/...')
        .describe('allowsymetricboardsizes', 'Allow symetric X/Y Y/X boardsizes, for example 25x1 also allows 1x25')
        .default('allowsymetricboardsizes', 'true/...')
        .describe('noautokomi', 'Do not allow komi to be set to -automatic- for ranked / unranked games')
        .default('noautokomi', 'false/...')
        .describe('noautohandicap', 'Do not allow handicap to be set to -automatic- for ranked / unranked games')
        .default('noautohandicap', 'false/...')
        //         3B2) COMMA-SEPARATED FAMILIES RANKED/UNRANKED:
        //             3B2-1) NUMBER FAMILIES:
        .describe('boardsizes', 'Board size(s) square (if --boardsizeheights is not specified), '
                                + 'or board size width(s) (if it is specified), '
                                + 'to accept for ranked / unranked games')
        .string('boardsizes')
        .default('boardsizes', '9,13,19/...')
        .describe('komis', 'Allowed komi values for ranked / unranked games')
        .string('komis')
        .default('komis', 'automatic/...')
        //             3B2-2) WORDS FAMILIES:
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
        //         3C) MINMAX RANKED/UNRANKED:
        //             3C1) MIN:MAX
        .describe('rank', 'minimum:maximum (weakest:strongest) opponent ranks to accept for ranked / unranked games (example 15k:1d/...)')
        .string('rank')
        .describe('handicap', 'minimum:maximum number of handicap stones to accept (example -1:9), -1 is automatic handicap')
        //             3C2) MIN:MAX MAINTIME_PERIODTIME_PERIODS
         // 15 seconds : 5 minutes _ periods _ 5 seconds : 10 seconds
        .describe('blitz', 'Blitz maintime_periods_periodtime settings for ranked / unranked games')
        .default('blitz', '15:300_3:20_5:10/...')
        // 1 minute : 2 hours _ periods _ 10 seconds : 2 minutes
        .describe('live', 'Live maintime_periods_periodtime settings for ranked / unranked games')
        .default('live', '60:7200_3:20_10:120/...')
        // 3 days : 7 days _ periods _ 4 hours : 3 days
        .describe('correspondence', 'Correspondence maintime_periods_periodtime settings for ranked / unranked games')
        .default('correspondence', '259200:604800_3:10_14400:259200/...')
    ;

    const argv = optimist.argv;
    if (!argv._ || argv._.length === 0) {
        optimist.showHelp();
        process.exit();
    }

    const debugStatus = argv.debug ? "ON" : "OFF";
    console.log(`\ngtp2ogs version 6.0`
                + `\n--------------------`
                + `\n- For changelog or latest devel updates, please visit https://github.com/online-go/gtp2ogs/tree/devel`
                + `\nDebug status: ${debugStatus}`);
                
    const deprecatedArgvArrays = [ 
        [["bot", "id", "botid"], "username"],
        [["maxtotalgames"], "maxconnectedgames"],
        [["maxactivegames"], "maxconnectedgamesperuser"],
        createDeprecationsPluralAndSingularRU("boardsizes"),
        [["boardsizewidths", "boardsizewidthsranked", "boardsizewidthsunranked"], false],
        [["boardsizeheights", "boardsizeheightsranked", "boardsizeheightsunranked"], false],
        createDeprecationsPluralAndSingularRU("komis"),
        createDeprecationsPluralAndSingularRU("bans"),
        createDeprecationsPluralAndSingularRU("speeds"),
        createDeprecationsPluralAndSingularRU("timecontrols"),
        createMinMaxDeprecationsRU("rank"),
        createMinMaxDeprecationsRU("handicap"),
        [["maintime", "periods", "periodtime"], false],
        createMinMaxDeprecationsBlitzLiveCorrRU("blitz"),
        createMinMaxDeprecationsBlitzLiveCorrRU("live"),
        createMinMaxDeprecationsBlitzLiveCorrRU("corr"),
        [["nopauseranked", "nopauseunranked"], "nopause with / to separate ranked and unranked settings"]
    ];
    for (const deprecatedArgvArray of deprecatedArgvArrays) {
        const [oldNames, newNameMsg] = deprecatedArgvArray;
        for (const oldName of oldNames) {
            if (argv[oldName]) {
                const beginning = `Deprecated: --${oldName} is no longer supported`;
                const ending = `see all supported options list for details:`
                                + `\nhttps://github.com/online-go/gtp2ogs/blob/devel/docs/OPTIONS-LIST.md`
                if (newNameMsg) {
                    throw new `${beginning}, use --${newNameMsg} instead, ${ending}`;
                } else {
                    throw new `${beginning}, ${ending}`;
                }
            }
        }
    }
    for (const arg of ["auto", "null"]) {
        if (argv.komis.replace("/",",").split(',').includes(arg)) {
            throw new `Deprecated: komis /${arg}/ is no longer supported, `
                      + `use /automatic/ instead`;
        }
    }
    console.log("\n");

    console.log(`CHECKING WARNINGS:`
                + `\n-------------------------------------------------------`);
    let isWarning = false;
    for (const [rankedUnrankedArg, rankedUnranked] of getArgsArraysRankedAndUnranked(argv.nopause)) {
        // avoid infinite games
        // TODO: if --maxpausetime gets implemented, we can remove this
        if (rankedUnrankedArg !== "true") {
            isWarning = true;
            console.log(`    Warning: Nopause setting for ${rankedUnranked} games not detected, `
                        + `${rankedUnranked} games are likely to last forever`);
        }
    }
    for (const [rankedUnrankedArg, rankedUnranked] of getArgsArraysRankedAndUnranked(argv.timecontrols)) {
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

    // included "nopause" here to be able to do a functionnal check on argv ranked/unranked
    const argNamesChecks = ["rejectnew", "rejectnewfile",
        "maxconnectedgames", "maxconnectedgamesperuser",
        "rankedonly", "unrankedonly", "privateonly", "publiconly",
        "boardsizes", "komis",
        "rules", "challengercolors", "speeds", "timecontrols",
        "proonly", "allowsymetricboardsizes",
        "noautohandicap", "noautokomi", "nopauseonweekends",
        "nopause",
        "rank", "handicap",
        "blitz", "live","correspondence"];

    for (const k in argv) {
        if (!argNamesChecks.includes(k)) {
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
    // 1) aspecific args:
    exports.check_and_get_reject_rejectnew = function () 
    {
        const isReject = (argv.rejectnew || 
                        (argv.rejectnewfile && fs.existsSync(argv.rejectnewfile)));
        if (isReject) return true;
    };

    exports.check_and_get_reject_booleans_aspecific = function (notif, familyNameString)
    {
        const isReject = argv[familyNameString] && notif;
        if (isReject) return true;
    }

    exports.check_and_get_reject_max_aspecific = function (notif, familyNameString)
    {
        const maxAllowed = argv[familyNameString];
        const isReject = notif > maxAllowed;
        if (isReject) return { maxAllowed };
    }

    // 2) ranked/unranked args:
    exports.check_and_get_reject_booleans_RU = function (notif, rankedStatus, familyNameString)
    {
        const isReject = (getArgsStringRankedOrUnranked(argv[familyNameString], rankedStatus, familyNameString) === "true");
        if (isReject) return true;
    }

    exports.check_and_get_reject_boardsizes_comma_RU = function (notifW, notifH, rankedStatus)
    {
        const familyNameString = "boardsizes";
        const argsString = getArgsStringRankedOrUnranked(argv[familyNameString], rankedStatus, familyNameString);
        if (argsString !== "all") {
            for (const arg of argsString.split(',')) {
                const [argX, argY] = arg.split('x');
                const rangeX = getAllNumbersInRange(argX);
                const rangeY = getAllNumbersInRange(argY);
                const allowSymetricRU = getArgsStringRankedOrUnranked(argv.allowsymetricboardsizes, rankedStatus, "allowsymetricboardsizes");
                for (const x of rangeX) {
                    if (x === notifW || (allowSymetricRU && x === notifH)) {
                        // check custom
                        if (argY !== undefined) {
                            for (const y of rangeY) {
                                if (y === notifH || (allowSymetricRU && y === notifW)) {
                                    return;
                                }
                            }
                        }
                        // check square
                        if (x === notifH || (allowSymetricRU && x === notifW)) {
                            return;
                        }
                    }
                }
            }
            return { argsString };
        }
    }

    exports.check_and_get_reject_numbers_comma_RU = function (notif, rankedStatus, familyNameString)
    {
        const argsString = getArgsStringRankedOrUnranked(argv[familyNameString], rankedStatus, familyNameString);
        if (argsString !== "all" && String(notif) !== "null") {
            // "automatic" komi is dealt with separately with --noautokomi
            for (const arg of argsString.split(',')) {
                const isReject = (arg.includes(':') ? checkAndCreateMinMaxReject(argsString, notif, false, false)
                                                  : (arg !== notif));
                if (isReject) return { argsString };
            }
        }
    }

    exports.check_and_get_reject_words_comma_RU = function (notif, rankedStatus, familyNameString)
    {
        const argsString = getArgsStringRankedOrUnranked(argv[familyNameString], rankedStatus, familyNameString);
        if (argsString !== "all") {
            const isReject = !argsString.split(',').includes(notif);
            if (isReject) return { argsString };
        }
    }

    exports.check_and_get_reject_min_max_RU = function (notif, rankedStatus, familyNameString, name)
    {
        const args = getArgsStringRankedOrUnranked(argv[familyNameString], rankedStatus, familyNameString);
        return checkAndCreateMinMaxReject(args, notif, name, false);
    };

    exports.check_and_get_reject_min_max_maintime_periods_periodtime_BLC_RU = function (notif, rankedStatus, familyNameString)
    {
        const args = getArgsStringRankedOrUnranked(argv[familyNameString], rankedStatus, familyNameString);
        const timeSettings = args.split('_');
        if (timeSettings.length !== 3) {
            throw new `Error in ${familyNameString} time settings: unexpected use of the `
                      + `maintime_periods_periodtime separator : expected 3 parts, not `
                      + `${timeSettings.length}`;
        }

        const maintimeOutputs = getMainTimeNameNotifsNames(notif.time_control);
        const periodtimeOutputs = getPeriodTimeNameNotifsNames(notif.time_control);

        const mppTests = [ ["maintime", timeSettings[0], maintimeOutputs],
                           ["periods", timeSettings[1], [notif.periods, "the number of periods"]],
                           ["periodtime", timeSettings[2], periodtimeOutputs]
                         ];
        for (const [mpp, arg, outputs] of mppTests) {
            if (outputs) {
                for (const [notifMPP, notifNameMPP] of outputs) {
                    const rejectResult = checkAndCreateMinMaxReject(arg, notifMPP, notifNameMPP, mpp);
                    if (rejectResult) return rejectResult;
                }
            }
        }
    };

}

// deprecations:
function createDeprecationsPluralAndSingularRU(name) {
    const nameSingular = name.slice(0, name.length - 1);
    const oldRU = ["ranked", "unranked"];
    const veryOldRU = ["", "ranked", "unranked"];

    const oldNames = oldRU.map( str => `${name}${str}` )
                          .concat(veryOldRU.map( str => `${nameSingular}${str}` ));

    const newName = `${name} min:max/min:max syntax for ranked/unranked games`;
    return [oldNames, newName];
}

function createMinMaxDeprecationsRU(name) {
    let oldNames = [];
    for (const minMax of ["min", "max"]) {
        for (const ARU of ["", "ranked", "unranked"]) {
            oldNames = oldNames.push(`${minMax}${name}${ARU}`);
        }
    } 
    const newName = `${name} min:max/min:max syntax for ranked/unranked games`;
    return [oldNames, newName];
}

function createMinMaxDeprecationsBlitzLiveCorrRU(blitzLiveCorr) {
    const blitzLiveCorrConverted = (blitzLiveCorr === "corr" ? "correspondence" : blitzLiveCorr);
    let oldNames = [];
    for (const minMax of ["min", "max"]) {
        for (const mpt of ["maintime", "periods", "periodtime"]) {
            for (const ARU of ["", "ranked", "unranked"]) {
                oldNames = oldNames.push(`${minMax}${mpt}${blitzLiveCorr}${ARU}`);
            }
        }
    }
    const newNamesString = `${blitzLiveCorrConverted} with the _ to separate `
                           + `maintime_periods_periodtime, and : to separate `
                           + `min:max , and the / syntax for ranked/unranked games`;
    return [oldNames, newNamesString];
}

// warnings:
function getArgsArraysRankedAndUnranked(arg) {
    const [ranked, unranked] = arg.split('/');
    return ( [[ranked, "ranked"],
              [unranked, "unranked"]] );
}

// ranked/unranked args:
function getArgsStringRankedOrUnranked(argsString, rankedStatus, familyNameString) {
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

function getMainTimeNameNotifsNames(timecontrol) {
    // add arrays for fischer maintimes: 2 time settings in 1 timecontrol
    if (timecontrol === "fischer") {
        return [ ["Initial Time", notif.initial_time],
                 ["Max Time", notif.max_time] ];
    }
    if (["byoyomi", "canadian"].includes(timecontrol)) {
        return [ ["Main Time", notif.main_time] ];
    }
    if (timecontrol === "absolute") {
        return [ ["Total Time", notif.total_time] ];
    }
    if (["simple", "none"].includes(timecontrol)) {
        return;
    }
    throw new `Error: unknown time control ${timecontrol}, can't check challenge.`;
}

function getPeriodTimeNameNotifsNames(timecontrol) {
    /*  note: - for canadian periodtimes, notif.period_time is already for X stones,
    /           so divide it by the number of stones so that we can compare it to periodtime 
    /           arg (for 1 stone in all timecontrols)   
    /           e.g. 10 minutes period time for all the 20 stones = 10*60 / 20 
    /                = 30 seconds average period time for 1 stone.*/
    if (timecontrol === "fischer") {
        return [ ["Increment Time", notif.time_increment] ];
    }
    if (timecontrol === "byoyomi") {
        return [ ["Period Time", notif.period_time] ];
    }
    if (timecontrol === "canadian") {
        return [ [`Period Time for all the ${notif.stones_per_period} stones`,
                  (notif.period_time / notif.stones_per_period)] ];
    }
    if (timecontrol === "simple") {
        return [ ["Time per move", notif.per_move] ];
    }
    if (["absolute", "none"].includes(timecontrol)) {
        return;
    }
}

function checkAndCreateMinMaxReject(argsString, notif, name, mpp) {
    const [minArg, maxArg] = argsString.split(':')
                                       .map( str => Number(str) );
    const minReject = notif < minAllowed;
    const maxReject = maxAllowed < notif;
    // if an arg is missing, Number(undefined) returns NaN,
    // and any math operation on NaN returns false (don't reject challenge)
    for (const [reject, minMax, minMaxArg] of [ [minReject, "min", minArg],
                                                [maxReject, "max", maxArg] ]) {
        if (isReject) {
            return { minMax,
                     isMin: (minMax === "min"),
                     minMaxArg,
                     name,
                     mpp
                   };
        }
    }
}

function getAllNumbersInRange(range) {
    if (range !== undefined) {
        let allNumbersInRange = [];
        if (range.includes(':')) {
            const [minRange, maxRange] = range.split(':')
                                              .map(str => Number(str));
            for (let i = minRange; i <= maxRange; ++i) {
                allNumbersInRange.push(i)
            }
            return allNumbersInRange;
        }
        return range;
    }
}
