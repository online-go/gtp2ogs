// vim: tw=120 softtabstop=4 shiftwidth=4

let fs = require('fs')
let console = require('console');

exports.check_rejectnew = function() {};
exports.banned_users = {};
exports.banned_users_ranked = {};
exports.banned_users_unranked = {};
exports.allowed_boardsizes = [];
exports.allow_all_boardsizes = false;
exports.allow_custom_boardsizes = false;
exports.allowed_custom_boardsizewidths = [];
exports.allowed_custom_boardsizeheights = [];
exports.allowed_boardsizes_ranked = [];
exports.allow_all_boardsizes_ranked = false;
exports.allow_custom_boardsizes_ranked = false;
exports.allowed_custom_boardsizewidths_ranked = [];
exports.allowed_custom_boardsizeheights_ranked = [];
exports.allowed_boardsizes_unranked = [];
exports.allow_all_boardsizes_unranked = false;
exports.allow_custom_boardsizes_unranked = false;
exports.allowed_custom_boardsizewidths_unranked = [];
exports.allowed_custom_boardsizeheights_unranked = [];
exports.allow_all_komis = false;
exports.allowed_komis = [];
exports.allow_all_komis_ranked = false;
exports.allowed_komis_ranked = [];
exports.allow_all_komis_unranked = false;
exports.allowed_komis_unranked = [];
exports.allowed_speeds = {};
exports.allowed_speeds_ranked = {};
exports.allowed_speeds_unranked = {};
exports.allowed_timecontrols = {};
exports.allowed_timecontrols_ranked = {};
exports.allowed_timecontrols_unranked = {};

exports.updateFromArgv = function() {
    const optimist = require("optimist")
           // 1) ROOT ARGUMENTS :
        .usage("Usage: $0 --username <bot-username> --apikey <apikey> [arguments] -- botcommand [bot arguments]")
        .demand('username')
        .demand('apikey')
        .describe('username', 'Specify the username of the bot, for example GnuGo')
        .describe('apikey', 'Specify the API key for the bot')
        .describe('greeting')
        .string('greeting')
        .describe('farewell', 'Thank you message to appear in chat at end of game (ex: -Thank you for playing-)')
        .string('farewell')
        .describe('rejectnew', 'Reject all new challenges with the default reject message')
        .describe('rejectnewmsg', 'Adds a customized reject message included in quote yourmessage quote')
        .default('rejectnewmsg', 'Currently, this bot is not accepting games, try again later ')
        .describe('rejectnewfile', 'Reject new challenges if file exists (checked each time, can use for load-balancing)')
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
        .describe('nopause', 'Do not allow pauses during games')
        .describe('nopauseranked', 'Do not allow pauses during ranked games')
        .describe('nopauseunranked', 'Do not allow pauses during unranked games')
        .describe('corrqueue', 'Process correspondence games one at a time')
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
        .describe('proonly', 'For all matches, only accept those from professionals')
        .describe('fakerank', 'Fake bot ranking to calculate automatic handicap stones number in autohandicap (-1) based on rankDifference between fakerank and user ranking, to fix the bypass minhandicap maxhandicap issue if handicap is -automatic')
        // 2) ARGUMENTS TO CHECK RANKED/UNRANKED CHALLENGES:
        //     A) ALL/RANKED/UNRANKED FAMILIES :
        .describe('bans', 'Comma separated list of usernames or IDs')
        .string('bans')
        .describe('bansranked', 'Comma separated list of usernames or IDs who are banned from ranked games')
        .string('bansranked')
        .describe('bansunranked', 'Comma separated list of usernames or IDs who are banned from unranked games')
        .string('bansunranked')
        //     B) GENERAL/RANKED/UNRANKED FAMILIES :
        //         B1) ALLOWED FAMILIES :
        .describe('boardsizes', 'Board size(s) to accept')
        .string('boardsizes')
        .default('boardsizes', '9,13,19')
        .describe('boardsizesranked', 'Board size(s) to accept for ranked games')
        .string('boardsizesranked')
        .describe('boardsizesunranked', 'Board size(s) to accept for unranked games')
        .string('boardsizesunranked')
        .describe('boardsizewidths', 'For custom board sizes, specify boardsize width(s) to accept, for example 25')
        .string('boardsizewidths')
        .describe('boardsizeheights', 'For custom board sizes, specify boardsize height(s) to accept, for example 1')
        .string('boardsizeheights')
        .describe('boardsizewidthsranked', 'For custom board sizes, specify boardsize width(s) to accept for ranked games, for example 25')
        .string('boardsizewidthsranked')
        .describe('boardsizeheightsranked', 'For custom board sizes, specify boardsize height(s) to accept for ranked games, for example 1')
        .string('boardsizeheightsranked')
        .describe('boardsizewidthsunranked', 'For custom board sizes, specify boardsize width(s) to accept for unranked games, for example 25')
        .string('boardsizewidthsunranked')
        .describe('boardsizeheightsunranked', 'For custom board sizes, specify boardsize height(s) to accept for unranked games, for example 1')
        .string('boardsizeheightsunranked')
        .describe('komis', 'Allowed komi values')
        .string('komis')
        .default('komis', 'automatic')
        .describe('komisranked', 'Allowed komi values for ranked games')
        .string('komisranked')
        .describe('komisunranked', 'Allowed komi values for unranked games')
        .string('komisunranked')
        .describe('speeds', 'Game speed(s) to accept')
        .default('speeds', 'blitz,live,correspondence')
        .describe('speedsranked', 'Game speed(s) to accept for ranked games')
        .describe('speedsunranked', 'Game speed(s) to accept for unranked games')
        .describe('timecontrols', 'Time control(s) to accept')
        .default('timecontrols', 'fischer,byoyomi,simple,canadian')
        .describe('timecontrolsranked', 'Time control(s) to accept for ranked games')
        .describe('timecontrolsunranked', 'Time control(s) to accept for unranked games')
        //         B2) GENERIC GENERAL/RANKED/UNRANKED ARGUMENTS : :
        .describe('noautohandicap', 'Do not allow handicap to be set to -automatic-')
        .describe('noautohandicapranked', 'Do not allow handicap to be set to -automatic- for ranked games')
        .describe('noautohandicapunranked', 'Do not allow handicap to be set to -automatic- for unranked games')
        /* note: - nopause allows to disable pauses DURING games, (game.js), but
        /        - nopauseonweekends rejects challenges BEFORE games (connection.js)
        /          (only for correspondence games)*/
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
        .describe('minhandicap', 'Minimum handicap to accept')
        .describe('maxhandicap', 'Maximum handicap to accept')
        .describe('minhandicapranked', 'Minimum handicap to accept for ranked games')
        .describe('maxhandicapranked', 'Maximum handicap to accept for ranked games')
        .describe('minhandicapunranked', 'Minimum handicap to accept for unranked games')
        .describe('maxhandicapunranked', 'Maximum handicap to accept for unranked games')
        .describe('minmaintimeblitz', 'Minimum seconds of main time for blitz games')
        .default('minmaintimeblitz', 15) // 15 seconds
        .describe('maxmaintimeblitz', 'Maximum seconds of main time for blitz games')
        .default('maxmaintimeblitz', 300) // 5 minutes 
        .describe('minmaintimeblitzranked', 'Minimum seconds of main time for blitz ranked games')
        .describe('maxmaintimeblitzranked', 'Maximum seconds of main time for blitz ranked games')
        .describe('minmaintimeblitzunranked', 'Minimum seconds of main time for blitz unranked games')
        .describe('maxmaintimeblitzunranked', 'Maximum seconds of main time for blitz unranked games')
        .describe('minmaintimelive', 'Minimum seconds of main time for live games')
        .default('minmaintimelive', 60) // 1 minute
        .describe('maxmaintimelive', 'Maximum seconds of main time for live ranked games')
        .default('maxmaintimelive', 7200) // 2 hours 
        .describe('minmaintimeliveranked', 'Minimum seconds of main time for live ranked games')
        .describe('maxmaintimeliveranked', 'Maximum seconds of main time for live ranked games')
        .describe('minmaintimeliveunranked', 'Minimum seconds of main time for live unranked games')
        .describe('maxmaintimeliveunranked', 'Maximum seconds of main time for live unranked games')
        .describe('minmaintimecorr', 'Minimum seconds of main time for correspondence games')
        .default('minmaintimecorr', 259200) // 3 days
        .describe('maxmaintimecorr', 'Maximum seconds of main time for correspondence games')
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
        .describe('minperiodtimeblitz', 'Minimum seconds of period time for blitz games')
        .default('minperiodtimeblitz', 5) // 5 seconds
        .describe('maxperiodtimeblitz', 'Maximum seconds of period time for blitz games')
        .default('maxperiodtimeblitz', 10) // 10 seconds
        .describe('minperiodtimeblitzranked', 'Minimum seconds of period time for blitz ranked games')
        .describe('maxperiodtimeblitzranked', 'Maximum seconds of period time for blitz ranked games')
        .describe('minperiodtimeblitzunranked', 'Minimum seconds of period time for blitz unranked games')
        .describe('maxperiodtimeblitzunranked', 'Maximum seconds of period time for blitz unranked games')
        .describe('minperiodtimelive', 'Minimum seconds of period time for live games')
        .default('minperiodtimelive', 10) // 10 seconds
        .describe('maxperiodtimelive', 'Maximum seconds of period time for live games')
        .default('maxperiodtimelive', 120) // 2 minutes
        .describe('minperiodtimeliveranked', 'Minimum seconds of period time for live ranked games')
        .describe('maxperiodtimeliveranked', 'Maximum seconds of period time for live ranked games')
        .describe('minperiodtimeliveunranked', 'Minimum seconds of period time for live unranked games ')
        .describe('maxperiodtimeliveunranked', 'Maximum seconds of period time for live unranked games ')
        .describe('minperiodtimecorr', 'Minimum seconds of period time for correspondence games')
        .default('minperiodtimecorr', 14400) // 4 hours
        .describe('maxperiodtimecorr', 'Maximum seconds of period time for correspondence games')
        .default('maxperiodtimecorr', 259200) // 3 days
        .describe('minperiodtimecorrranked', 'Minimum seconds of period time for correspondence ranked games')
        .describe('maxperiodtimecorrranked', 'Maximum seconds of period time for correspondence ranked games')
        .describe('minperiodtimecorrunranked', 'Minimum seconds of period time for correspondence unranked games')
        .describe('maxperiodtimecorrunranked', 'Maximum seconds of period time for correspondence unranked games')
    ;
    const argv = optimist.argv;

    if (!argv._ || argv._.length === 0) {
        optimist.showHelp();
        process.exit();
    }

    // console messages
    // A- greeting and debug status //
    let debugStatusMessage = "OFF";
    if (argv.debug) {
        debugStatusMessage = "ON\n-Will show detailed debug booting data\n-Will show all console notifications";
    }
    console.log(`\ngtp2ogs version 6.0\n--------------------\n- For changelog or latest devel updates, please visit https://github.com/online-go/gtp2ogs/tree/devel\nDebug status: ${debugStatusMessage}`);
    // B - check deprecated argv //
    testDeprecatedArgv(optimist.argv, "komis");

    /* EXPORTS FROM OPTIMIST.ARGV */
    /* 0) root exports*/
    for (let k in argv) {
        exports[k] = argv[k];
    }

    /* Add and Modify exports*/
    if (argv.debug) {
        exports.DEBUG = true;
    }
    for (let k of ["timeout", "startupbuffer"]) {
        if (argv[k]) {
            // Convert some times to microseconds once here so
            // we don't need to do it each time it is used later.
            exports[k] = argv[k] * 1000;
        }
    }
    if (argv.beta) {
        exports.host = 'beta.online-go.com';
    }
    if (argv.fakerank) {
        exports.fakerank = parseRank(argv.fakerank);
    }
    exports.bot_command = argv._;
    exports.check_rejectnew = function()
    {
        if (argv.rejectnew)  return true;
        if (argv.rejectnewfile && fs.existsSync(argv.rejectnewfile))  return true;
        return false;
    };
    if (exports.DEBUG) {
        let result = exports;
        delete result.apikey;
        console.log(`ROOT EXPORTS (apikey hidden):\n-------------------------------------------------------\n${JSON.stringify(result)}\n`);
    }

    /* 2) specifc r_u cases :*/
    if (argv.minrank && !argv.minrankranked && !argv.minrankunranked) {
        exports.minrank = parseRank(argv.minrank);
    }
    if (argv.minrankranked) {
        exports.minrankranked = parseRank(argv.minrankranked);
    }
    if (argv.minrankunranked) {
        exports.minrankunranked = parseRank(argv.minrankunranked);
    }
    if (argv.maxrank && !argv.maxrankranked && !argv.maxrankunranked) {
        exports.maxrank = parseRank(argv.maxrank);
    }
    if (argv.maxrankranked) {
        exports.maxrankranked = parseRank(argv.maxrankranked);
    }
    if (argv.maxrankunranked) {
        exports.maxrankunranked = parseRank(argv.maxrankunranked);
    }

    if (argv.bans) {
        for (let user of argv.bans.split(',')) {
            exports.banned_users[user] = true;
        }
    }
    if (argv.bansranked) {
        for (let user of argv.bansranked.split(',')) {
            exports.banned_users_ranked[user] = true;
        }
    }
    if (argv.bansunranked) {
        for (let user of argv.bansunranked.split(',')) {
            exports.banned_users_unranked[user] = true;
        }
    }

    if (argv.boardsizes) {
        for (let boardsize of argv.boardsizes.split(',')) {
            if (boardsize === "all") {
                exports.allow_all_boardsizes = true;
            } else if (boardsize === "custom") {
                exports.allow_custom_boardsizes = true;
                for (let boardsizewidth of argv.boardsizewidths.split(',')) {
                    exports.allowed_custom_boardsizewidths[boardsizewidth] = true;
                }
                for (let boardsizeheight of argv.boardsizeheights.split(',')) {
                    exports.allowed_custom_boardsizeheights[boardsizeheight] = true;
                }
            } else {
                exports.allowed_boardsizes[boardsize] = true;
            }
        }
    }
    if (argv.boardsizesranked) {
        for (let boardsizeranked of argv.boardsizesranked.split(',')) {
            if (boardsizeranked === "all") {
                exports.allow_all_boardsizes_ranked = true;
            } else if (boardsizeranked === "custom") {
                exports.allow_custom_boardsizes_ranked = true;
                for (let boardsizewidthranked of argv.boardsizewidthsranked.split(',')) {
                    exports.allowed_custom_boardsizewidths_ranked[boardsizewidthranked] = true;
                }
                for (let boardsizeheightranked of argv.boardsizeheightsranked.split(',')) {
                    exports.allowed_custom_boardsizeheights_ranked[boardsizeheightranked] = true;
                }
            } else {
                exports.allowed_boardsizes_ranked[boardsizeranked] = true;
            }
        }
    }
    if (argv.boardsizesunranked) {
        for (let boardsizeunranked of argv.boardsizesunranked.split(',')) {
            if (boardsizeunranked === "all") {
                exports.allow_all_boardsizes_unranked = true;
            } else if (boardsizeunranked === "custom") {
                exports.allow_custom_boardsizes_unranked = true;
                for (let boardsizewidthunranked of argv.boardsizeswidthunranked.split(',')) {
                    exports.allowed_custom_boardsizewidths_unranked[boardsizewidthunranked] = true;
                }
                for (let boardsizeheightunranked of argv.boardsizeheightsunranked.split(',')) {
                    exports.allowed_custom_boardsizeheights_unranked[boardsizeheightunranked] = true;
                }
            } else {
                exports.allowed_boardsizes_unranked[boardsizeunranked] = true;
            }
        }
    }

    if (argv.komis) {
        for (let komi of argv.komis.split(',')) {
            if (komi === "all") {
                exports.allow_all_komis = true;
            } else if (komi === "automatic") {
                exports.allowed_komis[null] = true;
            } else {
                exports.allowed_komis[komi] = true;
            }
        }
    }
    if (argv.komisranked) {
        for (let komiranked of argv.komisranked.split(',')) {
            if (komiranked === "all") {
                exports.allow_all_komis_ranked = true;
            } else if (komiranked === "automatic") {
                exports.allowed_komis_ranked[null] = true;
            } else {
                exports.allowed_komis_ranked[komiranked] = true;
            }
        }
    }
    if (argv.komisunranked) {
        for (let komiunranked of argv.komisunranked.split(',')) {
            if (komiunranked === "all") {
                exports.allow_all_komis_unranked = true;
            } else if (komiunranked === "automatic") {
                exports.allowed_komis_unranked[null] = true;
            } else {
                exports.allowed_komis_unranked[komiunranked] = true;
            }
        }
    }

    if (argv.speeds) {
        for (let e of argv.speeds.split(',')) {
            exports.allowed_speeds[e] = true;
        }
    }
    if (argv.speedsranked) {
        for (let e of argv.speedsranked.split(',')) {
            exports.allowed_speeds_ranked[e] = true;
        }
    }
    if (argv.speedsunranked) {
        for (let e of argv.speedsunranked.split(',')) {
            exports.allowed_speeds_unranked[e] = true;
        }
    }

    if (argv.timecontrols) {
        for (let e of argv.timecontrols.split(',')) {
            exports.allowed_timecontrols[e] = true;
        }
    }
    if (argv.timecontrolsranked) {
        for (let e of argv.timecontrolsranked.split(',')) {
            exports.allowed_timecontrols_ranked[e] = true;
        }
    }
    if (argv.timecontrolsunranked) {
        for (let e of argv.timecontrolsunranked.split(',')) {
            exports.allowed_timecontrols_unranked[e] = true;
        }
    }

    // console messages
    // C - check exports warnings :
    checkExportsWarnings("nopause");

    // Show in debug all the ranked/unranked exports results
    if (exports.DEBUG) {
        let result = exports;
        delete result.apikey;
        console.log(`${"r_u".toUpperCase()} EXPORTS RESULT (apikey hidden):\n-------------------------------------------------------\n${JSON.stringify(result)}\n`);
    }
}

// console messages:
function testDeprecatedArgv(optimistArgv, komisFamilyNameString) {
    const deprecatedArgv = [["botid", "username"],
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
    for (let [oldName, newName] of deprecatedArgv) {
        if (optimistArgv[oldName]) {
            console.log(`Deprecated: --${oldName} is no longer supported, use --${newName} instead.`);
        }
    }
    for (let komisGRUArg of familyArrayNamesGRU(komisFamilyNameString)) {
        if (optimistArgv[komisGRUArg]) {
            for (let komi of ["auto","null"]) {
                if (optimistArgv[komisGRUArg].split(",").includes(komi)) {
                    console.log(`Deprecated: --${komisGRUArg} /${komi}/ is no longer supported, use --${komisGRUArg} /automatic/ instead`);
                }
            }
        }
    }
    console.log("\n");
}


// optimist.argv.arg(general/ranked/unranked) to exports.(r_u).arg:
function familyArrayNamesGRU(familyNameString) {
    return ["", "ranked", "unranked"].map(e => `${familyNameString}${e}`);
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
            } else {
                console.error(`error : could not parse rank "${arg}"`);
                process.exit();
            }
        }
    }
}

function checkExportsWarnings(noPauseString) {
    console.log("CHECK EXPORTS WARNINGS:\n-------------------------------------------------------");
    let isWarning = false;
    // avoid infinite games
    //  TODO : whenever --maxpausetime +ranked + unranked gets implemented, remove this
    for (let r_u of ["ranked","unranked"]) {
        if (!exports[noPauseString] || !exports[`${noPauseString}${r_u}`]) {
            isWarning = true;
            console.log(`    Warning: No --${noPauseString} nor --${noPauseString}${r_u}, ${r_u} games are likely to last forever`); 
        }
    }
    if (isWarning) console.log("[ WARNINGS ! ]\n");
    else console.log("[ SUCCESS ]\n");
}
