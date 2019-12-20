// vim: tw=120 softtabstop=4 shiftwidth=4

let fs = require('fs')
let console = require('console');

exports.ranked = generateExportsRankedUnranked("ranked");
exports.unranked = generateExportsRankedUnranked("unranked");

exports.updateFromArgv = function() {
    const optimist = require("optimist")
        .usage("Usage: $0 --username <bot-username> --apikey <apikey> [arguments] -- botcommand [bot arguments]")
        .demand('username')
        .demand('apikey')
        .describe('username', 'Specify the username of the bot, for example GnuGo')
        .describe('apikey', 'Specify the API key for the bot')
        .describe('host', 'OGS Host to connect to')
        .default('host', 'online-go.com') // default to OGS. If --beta, host will switch to beta OGS automatically
        .describe('port', 'OGS Port to connect to')
        .default('port', 443)
        .describe('startupbuffer', 'Subtract this many seconds from time available on first move')
        .default('startupbuffer', 5)
        .describe('timeout', 'Disconnect from a game after this many seconds (if set)')
        .default('timeout', 0)
        .describe('insecure', 'Dont use ssl to connect to the ggs/rest servers')
        .describe('beta', 'Connect to the beta server (sets ggs/rest hosts to the beta server)')
        .describe('debug', 'Output GTP command and responses from your Go engine')
        .describe('logfile', 'In addition to logging to the console, also log gtp2ogs output to a text file')
        .describe('json', 'Send and receive GTP commands in a JSON encoded format')
        // TODO: Test known_commands for kgs-time_settings to set this, and remove the command line option
        .describe('kgstime', 'Set this if bot understands the kgs-time_settings command')
        .describe('showboard', 'Set this if bot understands the showboard GTP command, and if you want to display the showboard output')
        .describe('noclock', 'Do not send any clock/time data to the bot')
        .describe('persist', 'Bot process remains running between moves')
        .describe('corrqueue', 'Process correspondence games one at a time')
        .describe('maxconnectedgames', 'Maximum number of connected games for all users')
        .default('maxconnectedgames', 20)
        /* for maxconnectedgames, correspondence games are currently included in the 
        /  maxconnectedgames count if you use `--persist` )*/
        .describe('maxconnectedgamesperuser', 'Maximum number of connected games per user against this bot')
        .default('maxconnectedgamesperuser', 3)
        .describe('rejectnew', 'Reject all new challenges with the default reject message')
        .describe('rejectnewmsg', 'Adds a customized reject message included in quote yourmessage quote')
        .default('rejectnewmsg', 'Currently, this bot is not accepting games, try again later ')
        .describe('rejectnewfile', 'Reject new challenges if file exists (checked each time, can use for load-balancing)')
        .describe('bans', 'Comma separated list of usernames or IDs')
        .string('bans')
        .describe('bansranked', 'Comma separated list of usernames or IDs who are banned from ranked games')
        .string('bansranked')
        .describe('bansunranked', 'Comma separated list of usernames or IDs who are banned from unranked games')
        .string('bansunranked')
        .describe('boardsizes', 'Board size(s) to accept')
        .string('boardsizes')
        .default('boardsizes', '9,13,19')
        .describe('boardsizesranked', 'Board size(s) to accept for ranked games')
        .string('boardsizesranked')
        .describe('boardsizesunranked', 'Board size(s) to accept for unranked games')
        .string('boardsizesunranked')
        .string('boardsizeheightsunranked')
        .describe('komis', 'Allowed komi values')
        .string('komis')
        .default('komis', 'automatic')
        .describe('komisranked', 'Allowed komi values for ranked games')
        .string('komisranked')
        .describe('komisunranked', 'Allowed komi values for unranked games')
        .string('komisunranked')
        .describe('speeds', 'Game speed(s) to accept')
        .default('speeds', 'all') // "blitz", "live", "correspondence"
        .describe('speedsranked', 'Game speed(s) to accept for ranked games')
        .describe('speedsunranked', 'Game speed(s) to accept for unranked games')
        .describe('timecontrols', 'Time control(s) to accept')
        // for timecontrols details, see OPTIONS-LIST.md
        .default('timecontrols', 'fischer,byoyomi,simple,canadian')
        .describe('timecontrolsranked', 'Time control(s) to accept for ranked games')
        .describe('timecontrolsunranked', 'Time control(s) to accept for unranked games')
        .describe('minmaintimeblitz', 'Minimum seconds of main time for blitz ')
        .default('minmaintimeblitz', 15) // 15 seconds
        .describe('maxmaintimeblitz', 'Maximum seconds of main time for blitz ')
        .default('maxmaintimeblitz', 300) // 5 minutes 
        .describe('minmaintimeblitzranked', 'Minimum seconds of main time for blitz ranked games ')
        .describe('maxmaintimeblitzranked', 'Maximum seconds of main time for blitz ranked games ')
        .describe('minmaintimeblitzunranked', 'Minimum seconds of main time for blitz unranked games ')
        .describe('maxmaintimeblitzunranked', 'Maximum seconds of main time for blitz unranked games ')
        .describe('minmaintimelive', 'Minimum seconds of main time for live AND blitz ')
        .default('minmaintimelive', 60) // 1 minute
        .describe('maxmaintimelive', 'Maximum seconds of main time for live AND blitz ')
        .default('maxmaintimelive', 7200) // 2 hours 
        .describe('minmaintimeliveranked', 'Minimum seconds of main time for live AND blitz ranked games ')
        .describe('maxmaintimeliveranked', 'Maximum seconds of main time for live AND blitz ranked games ')
        .describe('minmaintimeliveunranked', 'Minimum seconds of main time for live AND blitz unranked games ')
        .describe('maxmaintimeliveunranked', 'Maximum seconds of main time for live AND blitz unranked games ')
        .describe('minmaintimecorr', 'Minimum seconds of main time for correspondence ')
        .default('minmaintimecorr', 259200) // 3 days
        .describe('maxmaintimecorr', 'Maximum seconds of main time for correspondence ')
        .default('maxmaintimecorr', 604800) // 7 days
        .describe('minmaintimecorrranked', 'Minimum seconds of main time for correspondence ranked games ')
        .describe('maxmaintimecorrranked', 'Maximum seconds of main time for correspondence ranked games ')
        .describe('minmaintimecorrunranked', 'Minimum seconds of main time for correspondence unranked games ')
        .describe('maxmaintimecorrunranked', 'Maximum seconds of main time for correspondence unranked games ')
        .describe('minperiodsblitz', 'Minimum number of periods for blitz games')
        .default('minperiodsblitz', 3)
        .describe('minperiodsblitzranked', 'Minimum number of periods for blitz ranked games')
        .describe('minperiodsblitzunranked', 'Minimum number of periods for blitz unranked games')
        .describe('maxperiodsblitz', 'Maximum number of periods for blitz games')
        .default('maxperiodsblitz', 20)
        .describe('maxperiodsblitzranked', 'Maximum number of periods for blitz ranked games')
        .describe('maxperiodsblitzunranked', 'Maximum number of periods for blitz unranked games')
        .describe('minperiodslive', 'Minimum number of periods for live games')
        .default('minperiodslive', 3)
        .describe('minperiodsliveranked', 'Minimum number of periods for live ranked games')
        .describe('minperiodsliveunranked', 'Minimum number of periods for live unranked games')
        .describe('maxperiodslive', 'Maximum number of periods for live games')
        .default('maxperiodslive', 20)
        .describe('maxperiodsliveranked', 'Maximum number of periods for live ranked games')
        .describe('maxperiodsliveunranked', 'Maximum number of periods for live unranked games')
        .describe('minperiodscorr', 'Minimum number of periods for correspondence games')
        .default('minperiodscorr', 3)
        .describe('minperiodscorrranked', 'Minimum number of periods for correspondence ranked games')
        .describe('minperiodscorrunranked', 'Minimum number of periods for correspondence unranked games')
        .describe('maxperiodscorr', 'Maximum number of periods for correspondence games')
        .default('maxperiodscorr', 10)
        .describe('maxperiodscorrranked', 'Maximum number of periods for correspondence ranked games')
        .describe('maxperiodscorrunranked', 'Maximum number of periods for correspondence unranked games')
        /* - for canadian period times, bot admin inputs periodtime for 1 stone as if timecontrol could be
        /  "byoyomi" or "fischer" or any other timecontrol, so to calculate our min/max arg we need to divide
        /  wanted periodtime for all the X stones by Y number of stones per period
        /  - ex: max periodtime 10 minutes / 20 stones = 10*60 /20 = 30 seconds/stone on average
        /  so bot admin would need to input --maxperiodtimeblitz 30 for example to allow max
        /  10 minutes for 20 stones, or 5 minutes for 10 stones, 3 minutes for 6 stones, 
        /  or any combination of average period time per stone * number of stones */
        .describe('minperiodtimeblitz', 'Minimum seconds of period time for blitz games')
        .default('minperiodtimeblitz', 5) // 5 seconds
        .describe('maxperiodtimeblitz', 'Maximum seconds of period time for blitz games')
        .default('maxperiodtimeblitz', 10) // 10 seconds
        .describe('minperiodtimeblitzranked', 'Minimum seconds of period time for blitz ranked games ')
        .describe('maxperiodtimeblitzranked', 'Maximum seconds of period time for blitz ranked games ')
        .describe('minperiodtimeblitzunranked', 'Minimum seconds of period time for blitz unranked games ')
        .describe('maxperiodtimeblitzunranked', 'Maximum seconds of period time for blitz unranked games ')
        .describe('minperiodtimelive', 'Minimum seconds of period time for live games')
        .default('minperiodtimelive', 10) // 10 seconds
        .describe('maxperiodtimelive', 'Maximum seconds of period time for live games ')
        .default('maxperiodtimelive', 120) // 2 minutes
        .describe('minperiodtimeliveranked', 'Minimum seconds of period time for live ranked games ')
        .describe('maxperiodtimeliveranked', 'Maximum seconds of period time for live ranked games ')
        .describe('minperiodtimeliveunranked', 'Minimum seconds of period time for live unranked games ')
        .describe('maxperiodtimeliveunranked', 'Maximum seconds of period time for live unranked games ')
        .describe('minperiodtimecorr', 'Minimum seconds of period time for correspondence games')
        .default('minperiodtimecorr', 14400) // 4 hours
        .describe('maxperiodtimecorr', 'Maximum seconds of period time for correspondence games')
        .default('maxperiodtimecorr', 259200) // 3 days
        .describe('minperiodtimecorrranked', 'Minimum seconds of period time for correspondence ranked games ')
        .describe('maxperiodtimecorrranked', 'Maximum seconds of period time for correspondence ranked games ')
        .describe('minperiodtimecorrunranked', 'Minimum seconds of period time for correspondence unranked games ')
        .describe('maxperiodtimecorrunranked', 'Maximum seconds of period time for correspondence unranked games ')
        .describe('minrank', 'Minimum opponent rank to accept (ex: 15k)')
        .string('minrank')
        .describe('minrankranked', 'Minimum opponent rank to accept for ranked games (ex: 15k)')
        .string('minrankranked')
        .describe('minrankunranked', 'Minimum opponent rank to accept for unranked games (ex: 15k)')
        .string('minrankunranked')
        .describe('maxrank', 'Maximum opponent rank to accept (ex: 1d)')
        .string('maxrank')
        .describe('maxrankranked', 'Maximum opponent rank to accept for ranked games (ex: 1d)')
        .string('maxrankranked')
        .describe('maxrankunranked', 'Maximum opponent rank to accept for unranked games(ex: 1d)')
        .string('maxrank')
        .describe('greeting', 'Greeting message to appear in chat at first move (ex: -Hello, have a nice game-)')
        .string('greeting')
        .describe('farewell', 'Thank you message to appear in chat at end of game (ex: -Thank you for playing-)')
        .string('farewell')
        .describe('proonly', 'Only accept matches from professionals')
        .describe('rankedonly', 'Only accept ranked matches')
        .describe('unrankedonly', 'Only accept unranked matches')
        .describe('minhandicap', 'Min handicap for all games')
        .describe('maxhandicap', 'Max handicap for all games')
        .describe('minhandicapranked', 'Min handicap for ranked games')
        .describe('maxhandicapranked', 'Max handicap for ranked games')
        .describe('minhandicapunranked', 'Min handicap for unranked games')
        .describe('maxhandicapunranked', 'Max handicap for unranked games')
        .describe('noautohandicap', 'Do not allow handicap to be set to -automatic-')
        .describe('noautohandicapranked', 'Do not allow handicap to be set to -automatic- for ranked games')
        .describe('noautohandicapunranked', 'Do not allow handicap to be set to -automatic- for unranked games')
        .describe('fakerank', 'Temporary manual bot ranking input by bot admin to fix autohandicap bypass issue, see /docs/OPTIONS-LIST.md for details')
        .describe('nopause', 'Do not allow games to be paused')
        .describe('nopauseranked', 'Do not allow ranked games to be paused')
        .describe('nopauseunranked', 'Do not allow unranked games to be paused')
        .describe('hidden', 'Hides the botname from the OGS game -Play against computer- bot list (but it can still accept challenges)')
    ;

    if (!optimist.argv._ || optimist.argv._.length === 0) {
        optimist.showHelp();
        process.exit();
    }

    // define all needed ranked/unranked argument families for exports
    // A) generic families :
    const genericSpecificRankedUnrankedFamiliesRank = ["minrank", "maxrank", "fakerank"];
    const genericMainRankedUnrankedFamilies = ["minmaintimeblitz","minmaintimelive",
        "minmaintimecorr","maxmaintimeblitz", "maxmaintimelive", "maxmaintimecorr", "minperiodsblitz",
        "minperiodslive", "minperiodscorr", "maxperiodsblitz", "maxperiodslive", "maxperiodscorr",
        "minperiodtimeblitz", "minperiodtimelive", "minperiodtimecorr", "maxperiodtimeblitz",
        "maxperiodtimelive", "maxperiodtimecorr", "minhandicap", "maxhandicap", "noautohandicap", "nopause"];
    const genericFullRankedUnrankedFamilies = genericSpecificRankedUnrankedFamiliesRank
                                              .concat(genericMainRankedUnrankedFamilies);
    const genericFullrankedUnrankedArgs = fullRankedUnrankedFamily(genericFullRankedUnrankedFamilies);

    // B) allowed_ and other "_" families :
    /* note : "banned_users_" family is not included here because
    /         it uses general arg AND ranked arg AND unranked arg */        
    const allowedRankedUnrankedFamilies = ["boardsizes", "komis", "speeds", "timecontrols"];

    // C) combinations of A) and B)
    const fullRankedUnrankedFamilies = allowedRankedUnrankedFamilies
                                       .concat(genericFullRankedUnrankedFamilies);

    // console messages
    // A- greeting and debug status //
    let debugStatusMessage = "-\n-Skipping debug booting data\n-Shrinking all console notifications";
    if (optimist.argv.debug) {
        debugStatusMessage = "ON\n-Will show detailed debug booting data\n-Will show all console notifications\n\nk IN OPTIMIST.ARGV[k] TO EXPORTS[k] RESULT:\n-------------------------------------------------------";
    }
    console.log(`\nYou are using gtp2ogs version 6.0\n- For changelog or latest devel updates, please visit https://github.com/online-go/gtp2ogs/tree/devel\nDebug status: ${debugStatusMessage}\n`);
    rootRankedUnrankedExports("DEBUG", optimist.argv.debug, optimist.argv.debug, "case copy (debug)");

    /* EXPORTS */
    /* 0) Set the exports(ranked/unranked) from optimist.argv[k] */
    for (let k in optimist.argv) {
        /* - export everything except for genericFullRankedUnrankedArgs.
        /  note: we let allowed_ and all/ranked/unranked families
        /  ex: "boardsizes", "boardsizesranked", "boardsizesunranked"
        /  be exported here because we will need them later.
        /
        /  - also, for the non ranked/unranked arguments (ex: persist),
        /  we also export a copy at the root of exports (ex: exports.persist,
        /  same as what was done earlier for exports.DEBUG) and we add this
        /  root export in debugLogExports */
        if (!genericFullrankedUnrankedArgs.includes(k)) {
            if (k === "host" && optimist.argv.beta) {
                rootRankedUnrankedExports(k, 'beta.online-go.com', 'beta.online-go.com', "case modified (beta)");
            } else if (k === "timeout" || k === "startupbuffer") {
                // Convert some times to microseconds once here so
                // we don't need to do it each time it is used later.
                rootRankedUnrankedExports(k, (optimist.argv[k])*1000, (optimist.argv[k])*1000, "case modified (*1000)");
            } else if (k === "apikey") {
                rootRankedUnrankedExports(k, optimist.argv[k], "hidden", "case hidden");
            } else { // ex: "persist", "maxconnectedgames", etc.
                rootRankedUnrankedExports(k, optimist.argv[k], optimist.argv[k], "result");
            }
        }
    }
    debugLogExports("\n");

    /* 1) for the rankedUnranked families, first we export every
    /     generic main thing (except specific cases) : */

    genericMainRankedUnrankedFamilies.forEach(e => mainRankedUnrankedExports(optimist.argv, e));

    /* 2) then for the rankedUnranked generic specific cases
    /     (ex:minmaxrank needs parsing before export
    /     as a number (ex: 29), not a string (ex: "1k") : */
    genericSpecificRankedUnrankedFamiliesRank.forEach(e => specificRankedUnrankedExports(optimist.argv, e));
    /* note : that code works for fakerank too even though
    /         there is no --fakerankranked and --fakerankunranked */

    rootRankedUnrankedExports("bot_command", optimist.argv._, optimist.argv._, "case copy (_)");

    const check_rejectnew = function()
    {
        if (optimist.argv.rejectnew)  return true;
        if (optimist.argv.rejectnewfile && fs.existsSync(optimist.argv.rejectnewfile))  return true;
        return false;
    };
    rootRankedUnrankedExports("check_rejectnew", check_rejectnew, check_rejectnew, "case function");

    // from now on we can work directly on exports :

    /* 3) then for the allowed_ (ex: boardsizes) and 
    /     All/ranked/Unranked (ex: bans) and other specific cases
    /     (ex: bot_command), we add specific exports : */
    [ ["boardsizes", ["width", "height"]],
      ["komis", ["komi", ""],
      ["speeds", ["speed", ""],
      ["timecontrols", ["time_control", ""]]
    ].forEach([e,[notifNames]] => genericAllowedFamiliesExports(e, notifNames));
    bannedUsersRankedUnrankedExports("bans");
    debugLogExports("\n");
    
    // Show in debug all the ranked/unranked exports results
    if (exports.DEBUG) {
        for (let rankedUnranked of ["ranked", "unranked"]) {
            console.log(`    ${rankedUnranked.toUpperCase()} EXPORTS RESULT :\n    ----------------------------\n`);
            for (let k in exports[rankedUnranked]) {
                if (k === "apikey") {
                    debugLogExports(`    case hidden_${rankedUnranked}: ${k} + hidden`);
                } else {
                    debugLogExports(`    result_${rankedUnranked}: ${k} + ${JSON.stringify(exports[rankedUnranked][k])}`);
                }
            }
            console.log("\n");
        }
    }

    // console messages
    // B - check deprecated features //
    testDeprecated("komis");

    // C - check Warnings :
    checkWarnings(optimist.argv, fullRankedUnrankedFamilies, "nopause");
}

/* begining of exports.(ranked/unranked) specific functions */
// primary functions:
function generateExportsRankedUnranked(rankedUnranked) {
    return {r_u_s: {r_u: rankedUnranked,
                    for_r_u_games: `for ${rankedUnranked} games`,
                    from_r_u_games: `from ${rankedUnranked} games`,
                    for_blc_r_u_games: ""}, // will be defined in connection.js
            banned_users: {},
            allow_all_boardsizes: false,
            allowed_notifnames_boardsizes: [],
            allowed_boardsizes: {},
            allow_all_komis: false,
            allowed_notifnames_komis: [],
            allowed_komis: {},
            allow_all_speeds: false,
            allowed_notifnames_speeds: [],
            allowed_speeds: {},
            allow_all_timecontrols: false,
            allowed_notifnames_timecontrols: [],
            allowed_timecontrols: {},
            check_rejectnew: function() {}
           };
}

function rootRankedUnrankedExports(k, arg, argDisplayed, introMsg) {
    exports.ranked[k] = arg || false;
    exports.unranked[k] = arg || false;
    exports[k] = arg || false;
    debugLogExports(`    ${introMsg}: ${k} + ${argDisplayed || false}`);
}

function familyRankedUnrankedArgs(optimistArgv, familyNameString) {
    const familyArray = familyArrayFromGeneralExportString(familyNameString);
    if (optimistArgv[familyArray[0]] && !optimistArgv[familyArray[1]] && !optimistArgv[familyArray[2]]) {
        return {ranked: optimistArgv[familyArray[0]], unranked: optimistArgv[familyArray[0]]};
    } else {
        return {ranked: (optimistArgv[familyArray[1]] || false),
                unranked: (optimistArgv[familyArray[2]] || false)};
    }
}

function exportsRankedUnrankedArgsAndLog(argObject, familyNameString) {
    for (let rankedUnranked of ["ranked", "unranked"]) {
        // ex: exports.ranked.minperiodtimelive = 15
        exports[rankedUnranked][familyNameString] = argObject[rankedUnranked] || false;
        debugLogExports(`    case first_exports_${rankedUnranked}: ${familyNameString} + ${argObject[rankedUnranked]}`);
    }
}

// concrete functions:
function mainRankedUnrankedExports(optimistArgv, familyNameString) {
    exportsRankedUnrankedArgsAndLog(familyRankedUnrankedArgs(optimistArgv, familyNameString), familyNameString);
}

function specificRankedUnrankedExports(optimistArgv, familyNameString) {
    let argObject = familyRankedUnrankedArgs(optimistArgv, familyNameString);
    for (let rankedUnranked in argObject) {
        argObject[rankedUnranked] = parseMinmaxRankFromNameString(argObject[rankedUnranked]);
    }
    exportsRankedUnrankedArgsAndLog(argObject, familyNameString);
}

function parseMinmaxRankFromNameString(arg) {
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
        }
    } else {
        debugLogExports(`    Could not parse rank "${arg}"`);
        return false;
    }
}

function genericAllowedFamiliesExports(familyNameString, notifNames) {
    for (let rankedUnranked of ["ranked", "unranked"]) {
        if (exports[rankedUnranked][familyNameString]) { // skip if ranked/unranked is false
            // ex: "19" (square) or "19,21,23,25,,,1,3,5" (non square)
            for (let value of exports[rankedUnranked][familyNameString].split(',,,')) { // ex: ["19"] (square) or ["25", "1"] (nonsquare)
                if (notifNames.length <= value.length) { // sanity check
                    // ex: exports.ranked.allowed_notifnames_boardsizes = ["width"] (square) or ["width", "height"] (nonsquare)
                    exports[rankedUnranked][`allowed_notifnames_${familyNameString}`] = notifNames;
                    debugLogExports(`    case allowed family: ${rankedUnranked}.allowed_notifnames_${familyNameString} + ${exports[rankedUnranked]["allowed_notifnames_" + familyNameString]}`);
                    for (let notifName of notifNames) {
                        for (let e of value.toString().split(',')) { // ex: "19"
                            if (e === "all") {
                                exports[rankedUnranked][`allow_all_${familyNameString}`][notifName] = true;
                                debugLogExports(`    case allowed family: ${rankedUnranked}.allow_all_${familyNameString}.${notifName} + ${exports[rankedUnranked]["allow_all_" + familyNameString][notifName}`);
                            } else if (familyNameString === "komis" && e === "automatic") {
                                exports[rankedUnranked][`allowed_${familyNameString}`][notifName][null] = true;
                                debugLogExports(`    case allowed family: ${rankedUnranked}.allowed_${familyNameString}.${notifName} / null(automatic) + ${exports[rankedUnranked]["allowed_" + familyNameString][notifName][null]}`);
                            } else {
                                // ex: exports.ranked.allowed_boardsizes.width.19 = true;
                                exports[rankedUnranked][`allowed_${familyNameString}`][notifName][e] = true;
                                debugLogExports(`    case allowed family: ${rankedUnranked}.allowed_${familyNameString}.${notifName} / ${e} + ${exports[rankedUnranked]["allowed_" + familyNameString][notifName][e]}`);
                            }
                        }
                    }
                } else {
                    console.log(`critical error in allowed family ${familyNameString}: notifNames.length ${notifNames.length} can't be strictly superior to value.length ${value.length}`);
                }
            }
        }
    }
}

function bannedUsersRankedUnrankedExports(bansString) {
    for (let rankedUnranked of ["ranked", "unranked"]) {
        // for the bans family we use bans AND bansranked AND bansunranked
        // but here conveniently for us in this code, --bans --bansranked and --bansunranked dont conflict
        if (exports[rankedUnranked][bansString]) {
            for (let e of exports[rankedUnranked][bansString].split(',')) { // ex: "bansranked" (user X)
                // ex: exports.ranked.banned_users.X = true;
                exports[rankedUnranked]["banned_users_"][e] = true;
                debugLogExports(`    case banned_family: ${rankedUnranked}.banned_users / ${e} + ${exports[rankedUnranked]["banned_users_"][e]}`);
            }
        }
    }
}
/* end of exports.(ranked/unranked) specific functions */

// abstract functions :
function familyArrayFromGeneralExportString(generalExportsString) {
    return ["", "ranked", "unranked"].map(e => generalExportsString + e);
}

function fullRankedUnrankedFamily(fullRankedUnrankedFamilies) {
    let familyArray = [];
    let finalArray = [];
    for (let familyNameString of fullRankedUnrankedFamilies) {
        familyArray = familyArrayFromGeneralExportString(familyNameString);
        finalArray.push(familyArray[0]);
        finalArray.push(familyArray[1]);
        finalArray.push(familyArray[2]);
    }
    return finalArray
}

// console messages functions:
function debugLogExports(messageString) {
    if (exports.DEBUG) {
        console.log(messageString);
    }
}

function testDeprecated(komisFamilyNameString) {
    const deprecatedExports = [["botid", "username"],
        ["bot", "username"],
        ["id", "username"],
        ["minrankedhandicap", "minhandicapranked"],
        ["minunrankedhandicap", "minhandicapunranked"],
        ["maxrankedhandicap", "maxhandicapranked"],
        ["maxunrankedhandicap", "maxhandicapunranked"],
        ["maxtotalgames", "maxconnectedgames"],
        ["maxactivegames", "maxconnectedgamesperuser"],
        ["maxmaintime",  "maxmaintimeblitz, --maxmaintimelive and/or --maxmaintimecorr"],
        ["maxmaintimeranked", "maxmaintimeblitzranked, --maxmaintimeliveranked and/or --maxmaintimecorrranked"],
        ["maxmaintimeunranked", "maxmaintimeblitzunranked, --maxmaintimeliveunranked and/or --maxmaintimecorrunranked"],
        ["minmaintime", "minmaintimeblitz, --minmaintimelive and/or --minmaintimecorr"],
        ["minmaintimeranked", "minmaintimeblitzranked, --minmaintimeliveranked and/or --minmaintimecorrranked"],
        ["minmaintimeunranked", "minmaintimeblitzunranked, --minmaintimeliveunranked and/or --minmaintimecorrunranked"],
        ["maxperiodtime", "maxperiodtimeblitz, --maxperiodtimelive and/or --maxperiodtimecorr"],
        ["maxperiodtimeranked", "maxperiodtimeblitzranked, --maxperiodtimeliveranked and/or --maxperiodtimecorrranked"],
        ["maxperiodtimeunranked", "maxperiodtimeblitzunranked, --maxperiodtimeliveunranked and/or --maxperiodtimecorrunranked"],
        ["minperiodtime", "minperiodtimeblitz, --minperiodtimelive and/or --minperiodtimecorr"],
        ["minperiodtimeranked", "minperiodtimeblitzranked, --minperiodtimeliveranked and/or --minperiodtimecorrranked"],
        ["minperiodtimeunranked", "minperiodtimeblitzunranked, --minperiodtimeliveunranked and/or --minperiodtimecorrunranked"],
        ["maxperiods",  "maxperiodsblitz, --maxperiodslive and/or --maxperiodscorr"],
        ["maxperiodsranked", "maxperiodsblitzranked, --maxperiodsliveranked and/or --maxperiodscorrranked"],
        ["maxperiodsunranked", "maxperiodsblitzunranked, --maxperiodsliveunranked and/or --maxperiodscorrunranked"],
        ["minperiods", "minperiodsblitz, --minperiodslive and/or --minperiodscorr"],
        ["minperiodsranked", "minperiodsblitzranked, --minperiodsliveranked and/or --minperiodscorrranked"],
        ["minperiodsunranked", "minperiodsblitzunranked, --minperiodsliveunranked and/or --minperiodscorrunranked"],
        ["ban", "bans"],
        ["banranked", "bansranked"],
        ["banunranked", "bansunranked"],
        ["boardsize", "boardsizes"],
        ["boardsizeranked", "boardsizesranked"],
        ["boardsizeunranked", "boardsizesunranked"],
        ["komi", "komis"],
        ["komiranked", "komisranked"],
        ["komiunranked", "komisunranked"],
        ["speed", "speeds"],
        ["speedranked", "speedsranked"],
        ["speedunranked", "speedsunranked"],
        ["timecontrol", "timecontrols"],
        ["timecontrolranked", "timecontrolsranked"],
        ["timecontrolunranked", "timecontrolsunranked"]
        ];
    console.log("CHECK DEPRECATIONS:\n-------------------------------------------------------");
    let isDeprecated = false;
    for (let [oldName, newName] of deprecatedExports) {
        if (exports[oldName]) {
            console.log(`    Deprecated: --${oldName} is deprecated, use --${newName} instead.`);
            isDeprecated = true;
        }
    }
    for (let komiExport of familyArrayFromGeneralExportString(komisFamilyNameString)) {
        if (exports[komiExport]) { // check to avoid undefined error if bot admin is not using it
            if (exports[komiExport].split(",").includes("auto")) {
                console.log(`    Deprecated: --${komiExport} /auto/ is no longer supported, use --${komiExport} /automatic/ instead`);
                isDeprecated = true;
            }
            if (exports[komiExport].split(",").includes("null")) {
                console.log(`    Deprecated: --${komiExport} /null/ is no longer supported, use --${komiExport} /automatic/ instead`);
                isDeprecated = true;
            }
        }
    }
    if (isDeprecated) {
        console.log("[ ERRORS ! ]\n");
    } else {
        console.log("[ SUCCESS ]\n");
    }
}

function checkWarnings(optimistArgv, rankedUnrankedFamilies, noPauseFamilyString) {
    console.log("CHECK WARNINGS:\n-------------------------------------------------------");
    let familyArray = [];
    let isWarning = false;
    // if optimistArgv[1], need optimistArgv[2], and vice versa
    for (let familyNameString of rankedUnrankedFamilies) {
        familyArray = familyArrayFromGeneralExportString(familyNameString);
        if (optimistArgv[familyArray[1]] && !optimistArgv[familyArray[2]]) {
            isWarning = true;
            console.log(`    Warning: --${familyArray[1]} detected but --${familyArray[2]} is missing !`);
        }
        if (optimistArgv[familyArray[2]] && !optimistArgv[familyArray[1]]) {
            isWarning = true;
            console.log(`    Warning: --${familyArray[2]} detected but --${familyArray[1]} is missing !`);
        }
    }
    // warn about potentially problematic timecontrols :
    const pTcs = [["absolute", "(no period time)"], ["none", "(infinite time)"]];
    for (let rankedUnranked of ["ranked", "unranked"]) {
        if (exports[rankedUnranked].allow_all_timecontrols === true) {
            isWarning = true;
            console.log(`    Warning: potentially problematic time control ${exports[rankedUnranked].r_u_s.for_r_u_games} detected (-${pTcs[0][0]}- ${pTcs[0][1]} and -${pTcs[1][0]}- ${pTcs[1][1]} in -all-) : may cause unwanted time management problems with users`);
        }
        for (let [tc, descr] of pTcs) {
            if (exports[rankedUnranked]["allowed_timecontrols"][tc] === true) {
                isWarning = true;
                console.log(`    Warning: potentially problematic time control ${exports[rankedUnranked].r_u_s.for_r_u_games} detected -${tc}- ${descr}: may cause unwanted time management problems with users`);
            }
        }
    }
    // avoid infinite games
    //  TODO : whenever --maxpausetime +ranked + unranked gets implemented, remove this
    familyArray = familyArrayFromGeneralExportString(noPauseFamilyString);
    if (!optimistArgv[familyArray[0]] && !optimistArgv[familyArray[1]] && !optimistArgv[familyArray[2]]) {
        isWarning = true;
        console.log(`    Warning: No --${familyArray[0]}, --${familyArray[1]}, nor --${familyArray[2]}, games are likely to last forever`); 
    } else if (!optimistArgv[familyArray[1]]) {
        isWarning = true;
        console.log(`    Warning: No --${familyArray[1]}, ranked games are likely to last forever`); 
    } else if (!optimistArgv[familyArray[2]]) {
        isWarning = true;
        console.log(`    Warning: No --${familyArray[2]}, unranked games are likely to last forever`); 
    }
    if (isWarning) {
        console.log("[ WARNINGS ! ]\n");
    } else {
        console.log("[ SUCCESS ]\n");
    }
}
