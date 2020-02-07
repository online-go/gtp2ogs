// vim: tw=120 softtabstop=4 shiftwidth=4

const fs = require('fs')
const console = require('console');

exports.check_rejectnew = function() {};

exports.updateFromArgv = function() {
    const optimist = require("optimist")
        // 1) ROOT ARGUMENTS:
        //     A) CHALLENGE-UNRELATED ARGS:
        .usage("Usage: $0 --username <bot-username> --apikey <apikey> [arguments] -- botcommand [bot arguments]")
        .demand('username')
        .demand('apikey')
        .describe('username', 'Specify the username of the bot, for example GnuGo')
        .describe('apikey', 'Specify the API key for the bot')
        .describe('greeting')
        .string('greeting')
        .describe('farewell', 'Thank you message to appear in chat at end of game (ex: -Thank you for playing-)')
        .string('farewell')
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
        /* note: - nopause allows to disable pauses DURING games, (game.js), but
        /        - nopauseonweekends rejects challenges BEFORE games (connection.js)
        /          (only for correspondence games)*/
        .describe('nopause', 'Do not allow pauses during games for ranked / unranked games')
        //     B) CHECK CHALLENGE ARGS
        /* note: for maxconnectedgames, correspondence games are currently included
        /  in the maxconnectedgames count if you use `--persist` )*/
        .describe('maxconnectedgames', 'Maximum number of connected games for all users')
        .default('maxconnectedgames', 20)
        .describe('maxconnectedgamesperuser', 'Maximum number of connected games per user against this bot')
        .default('maxconnectedgamesperuser', 3)
        .describe('rejectnew', 'Reject all new challenges with the default reject message')
        .describe('rejectnewmsg', 'Adds a customized reject message included in quote yourmessage quote')
        .default('rejectnewmsg', 'Currently, this bot is not accepting games, try again later ')
        .describe('rejectnewfile', 'Reject new challenges if file exists (checked each time, can use for load-balancing)')
        .describe('rankedonly', 'Only accept ranked matches')
        .describe('unrankedonly', 'Only accept unranked matches')
        /* ranked games can't be private (public only), no need for --publiconlyranked nor --privateonlyranked,
        /  nor their unranked args since the general argument is for unranked games too*/
        .describe('privateonly', 'Only accept private matches')
        .describe('publiconly', 'Only accept public (non-private) matches')
        .describe('fakerank', 'Fake bot ranking to calculate automatic handicap stones number in autohandicap (-1) based on rankDifference between fakerank and user ranking, to fix the bypass minhandicap maxhandicap issue if handicap is -automatic')
        // 2) CHECK CHALLENGE ARGS RANKED/UNRANKED:
        //     A) ALL/RANKED/UNRANKED FAMILIES:
        .describe('bans', 'Comma separated list of usernames or IDs for all games / ranked games only / unranked games only')
        .string('bans')
        //     B) RANKED/UNRANKED FAMILIES:
        //         B1) COMMA-SEPARATED FAMILIES RANKED/UNRANKED:
        .describe('boardsizes', 'Board size(s) to accept for ranked / unranked games')
        .string('boardsizes')
        .default('boardsizes', '9,13,19/...')
        .describe('boardsizewidths', 'For custom board sizes, boardsize width(s) to accept for ranked / unranked games')
        .string('boardsizewidths')
        .describe('boardsizeheights', 'For custom board sizes, boardsize height(s) to accept for ranked / unranked games')
        .string('boardsizeheights')
        .describe('komis', 'Allowed komi values for ranked / unranked games')
        .string('komis')
        .default('komis', 'automatic/...')
        .describe('rules', 'Rule(s) to accept')
        .default('rules', 'chinese/...')
        .describe('challengercolors', 'Challenger color(s) to accept for ranked / unranked games')
        .default('challengercolors', 'all/...')
        .describe('speeds', 'Game speed(s) to accept for ranked / unranked games')
        .default('speeds', 'all/...')
        .describe('timecontrols', 'Time control(s) to accept for ranked / unranked games')
        .default('timecontrols', 'fischer,byoyomi,simple,canadian/...')
        //         B2) BOOLEANS RANKED/UNRANKED:
        .describe('proonly', 'For all matches, only accept those from professionals for ranked / unranked games')
        .describe('nopauseonweekends', 'Do not accept matches that come with the option -pauses in weekends- (specific to correspondence games) for ranked / unranked games')
        .describe('noautohandicap', 'Do not allow handicap to be set to -automatic- for ranked / unranked games')
        //         B3) MINMAX RANKED/UNRANKED:
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
    //testDeprecatedArgv(argv, "komis");

    // ALL/RANKED/UNRANKED ARGS:
    const comma_all_ranked_unranked = ["bans"];

    // RANKED/UNRANKED ARGS:
    // 1) booleans:
    const booleans_ranked_unranked = ["noautohandicap",
    "proonly", "nopauseonweekends", "nopause"];

    // 2) comma_ranked_unranked:
    const comma_ranked_unranked = ["boardsizes",
        "boardsizewidths", "boardsizeheights", "komis",
        "rules", "challengercolors", "speeds", "timecontrols"];

    // 3) min max:
    const min_max_ranked_unranked = ["rank", "handicap",
        "maintimeblitz", "maintimelive","maintimecorr",
        "periodsblitz", "periodslive", "periodscorr",
        "periodtimeblitz", "periodtimelive", "periodtimecorr"];

    const full_ranked_unranked_argNames = booleans_ranked_unranked
                                          .concat(comma_ranked_unranked,
                                                  min_max_ranked_unranked,
                                                  comma_all_ranked_unranked);

    /* EXPORTS FROM argv */
    /* 0) root, challenge unrelated exports exports*/
    for (const k in argv) {
        if (!full_ranked_unranked_argNames.includes(k)) {
            /* Add and Modify exports*/
            if (k === "host" && argv.beta) {
                exports[k] = 'beta.online-go.com';
            } else if (["timeout","startupbuffer"].includes(k)) {
                // Convert some times to microseconds once here so
                // we don't need to do it each time it is used later.
                exports[k] = argv[k]*1000;
            } else if (k === "apikey") {
                exports[k] = argv[k];
            } else if (k === "debug") {
                exports.DEBUG = argv.debug;
                exports[k] = argv[k]; //TODO: remove either of these DEBUG or debug
            } else if (k === "_") {
                exports.bot_command = argv[k];
            } else if (k === "fakerank") {
                exports[k] = parseRank(argv[k]);
            } else { // ex: "persist", "maxconnectedgames", etc.
                exports[k] = argv[k];
            }
        }
    }

    // ARGV FUNCTIONNAL CHECKS EXPORTS
    // 1) root args:
    exports.check_rejectnew = function () 
    {
        if (argv.rejectnew)  return true;
        if (argv.rejectnewfile && fs.existsSync(argv.rejectnewfile))  return true;
        return false;
    };

    // 2)ranked/unranked args:
    exports.check_booleanArgs_RU = function (notif, rankedStatus, familyNameString)
    {
        const arg = argObjectRU(argv[familyNameString], rankedStatus, familyNameString);
        return { reject: (arg && notif) };
    }

    exports.check_minMaxArgs_RU = function (notif, rankedStatus, familyNameString)
    {
        const arg = argObjectRU(argv[familyNameString], rankedStatus, familyNameString);
        const [min, max] = arg.split(':');
        const minReject = notif < min;
        const maxReject = max < notif;
        return { reject: minReject || maxReject,
                 minReject,
                 maxReject };
    };

    exports.check_comma_RU = function (notif, rankedStatus, familyNameString) {
        const arg = argObjectRU(argv[familyNameString], rankedStatus, familyNameString);
        if (arg !== true) { // skip "all", is allowed
            
        }






 
        return { reject: false };
    }



    for (const familyNameString of allowed_r_u_Families) {
        const argObject = argObjectRU(argv[familyNameString], familyNameString);
        for (const r_u in argObject) {
            if (argObject[r_u]) {
                if (argObject[r_u] === "all") {
                    exports[r_u][`allow_all_${familyNameString}`] = true;
                } else if (argObject[r_u] === "custom") {
                    exports[r_u][`allow_custom_${familyNameString}`] = true;
                } else {
                    for (const allowedArg of argObject[r_u].split(',')) { // ex: ["9", "13", "15:17", "19:25:2"]
                        if (familyNameString === "komis" && allowedArg === "automatic") {
                            exports[r_u][`allowed_${familyNameString}`]["null"] = true;
                        } else if (allowedArg.includes(":")) {
                            const [numberA, numberB, incr] = allowedArg.split(":").map( n => Number(n) );
                            const [min, max] = [Math.min(numberA, numberB), Math.max(numberA, numberB)];
                            const increment = Math.abs(incr) || 1; // default is 1, this also removes allowedArg 0 (infinite loop)
                            // if too much incrementations, sanity check
                            const threshold = 1000;
                            if (( Math.abs(max-min)/increment ) > threshold) {
                                throw new `please reduce list length in ${familyNameString}, max is ${threshold} elements per range.`;
                            }
                            for (let i = min; i <= max; i = i + increment) {
                                exports[r_u][`allowed_${familyNameString}`][String(i)] = true;
                            }
                        } else {
                            exports[r_u][`allowed_${familyNameString}`][allowedArg] = true;
                        }
                    }
                }
            }
        }
    }

    for (const familyNameString of all_r_u_Families) {
        const [allGamesArg, rankedArg, unrankedArg] = argv[familyNameString].split('/');
        const arg_r_u_arrays = [ [allGamesArg, ["ranked", "unranked"]],
                                 [rankedArg,   ["ranked"]],
                                 [unrankedArg, ["unranked"]]
                               ];
        for (const [arg, r_u_arr] of arg_r_u_arrays) {
            if (arg) {
                for (const argExport of arg.split(',')) {
                    for (const r_u of r_u_arr) {
                        exports[r_u]["banned_users"][argExport] = true;
                    }
                }
            }
        }
    }
    
    // console messages
    // C - check exports warnings:
    checkExportsWarnings("nopause");

    // Show in debug all the ranked/unranked exports results
    if (exports.DEBUG) {
        const exportsResult = { ...exports, apikey: "hidden"};
        for (const r_u of ["ranked", "unranked"]) {
            console.log(`${r_u.toUpperCase()} EXPORTS RESULT:`
                         + `\n-------------------------------------------------------`
                         + `\n${JSON.stringify(exportsResult)}`
                         + `\n`);
        }
    }
}

// console messages:
/*function minMaxDeprecations(name, isBlitzLiveCorr) {
    let oldMinMaxNames = [`min${name}`, `max${name}`];
    let newNamesSentence = `${name} min:max`;
    if (isBlitzLiveCorr) {
        for (const blitzLiveCorr of ["blitz", "live", "corr"]) {
            oldMinMaxNames.push([`min${name}${blitzLiveCorr}`, `max${name}${blitzLiveCorr}`]);
            newNamesSentence = newNamesSentence + `, --${name}${blitzLiveCorr} min:max`;
        }
    }

    return [oldMinMaxNames, newNamesSentence];
}

function testDeprecatedArgv(optimistArgv, komisFamilyNameString) {
    const deprecatedArgvArrays = [ 
        [["bot", "id", "botid"], "username"],
        [["maxunrankedhandicap"], "maxhandicapunranked"],
        [["maxtotalgames"], "maxconnectedgames"],
        [["maxactivegames"], "maxconnectedgamesperuser"],
        [["ban"], "bans"],
        [["banranked"], "bansranked"],
        [["banunranked"], "bansunranked"],
        [["boardsize"], "boardsizes"],
        [["boardsizeranked"], "boardsizesranked"],
        [["boardsizeunranked"], "boardsizesunranked"],
        [["komi"], "komis"],
        [["komiranked"], "komisranked"],
        [["komiunranked"], "komisunranked"],
        [["speed"], "speeds"],
        [["speedranked"], "speedsranked"],
        [["speedunranked"], "speedsunranked"],
        [["timecontrol"], "timecontrols"],
        [["timecontrolranked"], "timecontrolsranked"],
        [["timecontrolunranked"], "timecontrolsunranked"],
        minMaxDeprecations("rank", false),
        minMaxDeprecations("rankranked", false),
        minMaxDeprecations("rankunranked", false),
        minMaxDeprecations("handicap", false),
        minMaxDeprecations("handicapranked", false),
        minMaxDeprecations("handicapunranked", false),
        minMaxDeprecations("maintime", true),
        minMaxDeprecations("maintimeranked", true),
        minMaxDeprecations("maintimeunranked", true),
        minMaxDeprecations("periodtime", true),
        minMaxDeprecations("periodtimeranked", true),
        minMaxDeprecations("periodtimeunranked", true),
        minMaxDeprecations("periods", true),
        minMaxDeprecations("periodsranked", true),
        minMaxDeprecations("periodsunranked", true),
    ];
    for (const deprecatedArgvArray of deprecatedArgvArrays) {
        const [oldNames, newNameMsg] = deprecatedArgvArray;
        for (const oldName of oldNames) {
            if (optimistArgv[oldName]) {
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
    for (const komisGRUArg of familyArrayNamesGRU(komisFamilyNameString)) {
        if (optimistArgv[komisGRUArg]) {
            for (const komi of ["auto","null"]) {
                if (optimistArgv[komisGRUArg].split(",").includes(komi)) {
                    throw new `Deprecated: --${komisGRUArg} /${komi}/ is 
                               no longer supported, use --${komisGRUArg} /automatic/ instead`;
                }
            }
        }
    }
    console.log("\n");
}*/

// ranked/unranked:
function argObjectRU(argsString, rankedStatus, familyNameString) {
        const rankedUnrankedArgs = argsString.split('/');
        if (rankedUnrankedArgs.length !== 2) {
            throw new `Error in in ${familyNameString} : unexpected use of the `
                      + `ranked/unranked separator : expected 2 parts, not `
                      + `${rankedUnrankedArgs.length}`;
        }
        const [ranked, unranked] = rankedUnrankedArgs
                                   .map( str => "all" ? true : str )
                                   .map( str => "..." ? ranked : str );
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

function checkReasonableArgs(noPauseString) {
    console.log(`CHECKING WARNINGS:
                 \n-------------------------------------------------------`);
    let isWarning = false;
    for (const r_u of ["ranked","unranked"]) {
        // avoid infinite games
        // TODO: if --maxpausetimeGRU gets implemented, we can remove this
        if (!exports[r_u][noPauseString]) {
            isWarning = true;
            console.log(`    Warning: No --${noPauseString} nor --${noPauseString}${r_u}, 
                         ${r_u} games are likely to last forever`);
        }

        // warn about potentially problematic timecontrols:
        const pTcs = [ ["absolute", "(no period time)"],
                       ["none", "(infinite time)"]
                     ];
        for (const [tc, descr] of pTcs) {
            if (exports[r_u]["allowed_timecontrols"][tc] === true ||
                exports[r_u]["allow_all_timecontrols"] === true) {
                isWarning = true;
                console.log(`    Warning: potentially problematic time control for ${r_u} games 
                             detected -${tc}- ${descr}: may cause unwanted time management 
                             problems with users`);
            }
        }
    }
    if (!isWarning) console.log("[ SUCCESS ]\n");
}
