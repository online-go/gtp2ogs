// vim: tw=120 softtabstop=4 shiftwidth=4

let fs = require('fs')
let console = require('console');

exports.DEBUG = false;
exports.PERSIST = false;
exports.KGSTIME = false;
exports.SHOWBOARD = false;
exports.NOCLOCK = false;
exports.GREETING = "";
exports.FAREWELL = "";
exports.REJECTNEWMSG = "";

exports.timeout = 0; // needed to define type, see : https://github.com/online-go/gtp2ogs/pull/208#issuecomment-562983535
exports.corrqueue = false; // needed too, do not delete until fully investigated

exports.check_rejectnew = function() {};
exports.banned_users = {};
exports.banned_users_ranked = {};
exports.banned_users_unranked = {};
exports.allow_all_boardsizes = false;
exports.allow_custom_boardsizes = false;
exports.allowed_boardsizes = [];
exports.allowed_custom_boardsizewidths = [];
exports.allowed_custom_boardsizeheights = [];
exports.allow_all_boardsizes_ranked = false;
exports.allow_custom_boardsizes_ranked = false;
exports.allowed_boardsizes_ranked = [];
exports.allowed_custom_boardsizewidths_ranked = [];
exports.allowed_custom_boardsizeheights_ranked = [];
exports.allow_all_boardsizes_unranked = false;
exports.allow_custom_boardsizes_unranked = false;
exports.allowed_boardsizes_unranked = [];
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
    let optimist = require("optimist")
        .usage("Usage: $0 --username <bot-username> --apikey <apikey> [arguments] -- botcommand [bot arguments]")
        .demand('username')
        .demand('apikey')
        .describe('username', 'Specify the username of the bot, for example GnuGo')
        .describe('apikey', 'Specify the API key for the bot')
        .describe('host', 'OGS Host to connect to')
        .default('host', 'online-go.com')
        .describe('port', 'OGS Port to connect to')
        .default('port', 443)
        .describe('startupbuffer', 'Subtract this many seconds from time available on first move')
        .default('startupbuffer', 5)
        .describe('timeout', 'Disconnect from a game after this many seconds (if set)')
        .default('timeout', 0)
        .describe('insecure', "Don't use ssl to connect to the ggs/rest servers")
        .describe('beta', 'Connect to the beta server (sets ggs/rest hosts to the beta server)')
        .describe('debug', 'Output GTP command and responses from your Go engine')
        .describe('logfile', 'In addition to logging to the console, also log gtp2ogs output to a text file')
        .describe('json', 'Send and receive GTP commands in a JSON encoded format')
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
        /* 1- for "absolute", bot admin can allow absolute if want, but then 
        /  make sure to increase minmaintimeblitz and minmaintimelive to high values
        /  2 - "none" is not in default values, can be manually allowed in timecontrol 
        /  argument but then games will be very very long*/
        .describe('minmaintimeblitz', 'Minimum seconds of main time for blitz ')
        .default('minmaintimeblitz', '15') // 15 seconds
        .describe('maxmaintimeblitz', 'Maximum seconds of main time for blitz ')
        .default('maxmaintimeblitz', '300') // 5 minutes 
        .describe('minmaintimeblitzranked', 'Minimum seconds of main time for blitz ranked games ')
        .describe('maxmaintimeblitzranked', 'Maximum seconds of main time for blitz ranked games ')
        .describe('minmaintimeblitzunranked', 'Minimum seconds of main time for blitz unranked games ')
        .describe('maxmaintimeblitzunranked', 'Maximum seconds of main time for blitz unranked games ')
        .describe('minmaintimelive', 'Minimum seconds of main time for live AND blitz ')
        .default('minmaintimelive', '60') // 1 minute
        .describe('maxmaintimelive', 'Maximum seconds of main time for live AND blitz ')
        .default('maxmaintimelive', '7200') // 2 hours 
        .describe('minmaintimeliveranked', 'Minimum seconds of main time for live AND blitz ranked games ')
        .describe('maxmaintimeliveranked', 'Maximum seconds of main time for live AND blitz ranked games ')
        .describe('minmaintimeliveunranked', 'Minimum seconds of main time for live AND blitz unranked games ')
        .describe('maxmaintimeliveunranked', 'Maximum seconds of main time for live AND blitz unranked games ')
        .describe('minmaintimecorr', 'Minimum seconds of main time for correspondence ')
        .default('minmaintimecorr', '259200') // 3 days
        .describe('maxmaintimecorr', 'Maximum seconds of main time for correspondence ')
        .default('maxmaintimecorr', '604800') // 7 days
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
        .default('minperiodtimeblitz', '5') // 5 seconds
        .describe('maxperiodtimeblitz', 'Maximum seconds of period time for blitz games')
        .default('maxperiodtimeblitz', '10') // 10 seconds
        .describe('minperiodtimeblitzranked', 'Minimum seconds of period time for blitz ranked games ')
        .describe('maxperiodtimeblitzranked', 'Maximum seconds of period time for blitz ranked games ')
        .describe('minperiodtimeblitzunranked', 'Minimum seconds of period time for blitz unranked games ')
        .describe('maxperiodtimeblitzunranked', 'Maximum seconds of period time for blitz unranked games ')
        .describe('minperiodtimelive', 'Minimum seconds of period time for live games')
        .default('minperiodtimelive', '10') // 10 seconds
        .describe('maxperiodtimelive', 'Maximum seconds of period time for live games ')
        .default('maxperiodtimelive', '120') // 2 minutes
        .describe('minperiodtimeliveranked', 'Minimum seconds of period time for live ranked games ')
        .describe('maxperiodtimeliveranked', 'Maximum seconds of period time for live ranked games ')
        .describe('minperiodtimeliveunranked', 'Minimum seconds of period time for live unranked games ')
        .describe('maxperiodtimeliveunranked', 'Maximum seconds of period time for live unranked games ')
        .describe('minperiodtimecorr', 'Minimum seconds of period time for correspondence games')
        .default('minperiodtimecorr', '14400') // 4 hours
        .describe('maxperiodtimecorr', 'Maximum seconds of period time for correspondence games')
        .default('maxperiodtimecorr', '259200') // 3 days
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
        .describe('greeting', 'Greeting message to appear in chat at first move (ex: "Hello, have a nice game")')
        .string('greeting')
        .describe('farewell', 'Thank you message to appear in chat at end of game (ex: "Thank you for playing")')
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
        .describe('hidden', 'Hides the botname from the OGS game "Play against computer" bot list (but it can still accept challenges)')
    ;
    let argv = optimist.argv;

    if (!argv._ || argv._.length === 0) {
        optimist.showHelp();
        process.exit();
    }

    // Set all the argv
    for(var k in argv) exports[k] = argv[k];

    // Convert timeout to microseconds once here so we don't need to do it each time it is used later.
    if (argv.timeout) {
        exports.timeout = argv.timeout * 1000;
    }
    if (argv.startupbuffer) {
        exports.startupbuffer = argv.startupbuffer * 1000;
    }

    if (argv.beta) {
        exports.host = 'beta.online-go.com';
    }
    let debugStatusMessage = "-\n-Skipping detailed booting data\n-Shrinking all console notifications";
    if (argv.debug) {
        exports.DEBUG = true;
        debugStatusMessage = "ON\n-Will show detailed booting data\n-Will show all console notifications";
    }
    if (argv.persist) {
        exports.PERSIST = true;
    }
    // TODO: Test known_commands for kgs-time_settings to set this, and remove the command line option
    if (argv.kgstime) {
        exports.KGSTIME = true;
    }
    if (argv.showboard) {
        exports.SHOWBOARD = true;
    }
    if (argv.noclock) {
        exports.NOCLOCK = true;
    }

    exports.check_rejectnew = function()
    {
        if (argv.rejectnew)  return true;
        if (argv.rejectnewfile && fs.existsSync(argv.rejectnewfile))  return true;
        return false;
    }

    // special families exports:
    parseMinmaxrankFamilyNameString("minrank");
    parseMinmaxrankFamilyNameString("maxrank");
    if (argv.fakerank) { // TODO : remove fakerank when the bypass automatic handicap issue is fixed, 
                         //        and/or when server adds an automatic handicap new object
        parseMinmaxRankFromNameString("fakerank");
    }
    exportBoardsizeIfArgv("boardsizes");
    exportKomiIfArgv("komis");
    exportIfArgv(["speeds", "timecontrols"]);

    exports.bot_command = argv._;

    // console messages
    // A- greeting and debug status //
    console.log(`\nYou are using gtp2ogs version 6.0\n- For changelog or latest devel updates, please visit https://github.com/online-go/gtp2ogs/tree/devel\nDebug status: ${debugStatusMessage}\n`);

    // B- exports full checks in debug //
    const allRankedUnrankedFamilies = ["bans"];
    const rankedUnrankedFamilies = ["boardsizes", "boardsizewidths", "boardsizeheights", "komis",
        "speeds", "timecontrols", "minhandicap", "maxhandicap", "minmaintimeblitz","minmaintimelive",
        "minmaintimecorr","maxmaintimeblitz", "maxmaintimelive", "maxmaintimecorr", "minperiodsblitz",
        "minperiodslive", "minperiodscorr", "maxperiodsblitz", "maxperiodslive", "maxperiodscorr",
        "minperiodtimeblitz", "minperiodtimelive", "minperiodtimecorr", "maxperiodtimeblitz",
        "maxperiodtimelive", "maxperiodtimecorr", "minrank", "maxrank", "noautohandicap", "nopause"];

    // apikey will be hidden if exports[apikey] : not in the array below
    const nonSpecificArgs = ["beta", "corrqueue", "debug", "fakerank", "farewell", "greeting",
        "hidden", "host", "insecure", "json", "kgstime", "logfile", "maxconnectedgames",
        "maxconnectedgamesperuser", "noclock", "persist", "persist", "proonly", "port",
        "rankedonly", "rejectnew", "rejectnewfile", "rejectnewmsg", "showboard", "startupbuffer",
        "timeout", "unrankedonly", "username"];

    if (exports.debug) {
        checkExports(allRankedUnrankedFamilies, rankedUnrankedFamilies, "apikey", nonSpecificArgs);
        console.log("\n");
    }

    // C - check deprecated features //
    const deprecatedArgs = [["botid", "username"],
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
        ["boardsizewidth", "boardsizewidths"],
        ["boardsizewidthranked", "boardsizewidthsranked"],
        ["boardsizewidthunranked", "boardsizewidthsunranked"],
        ["boardsizeheight", "boardsizeheights"],
        ["boardsizeheightranked", "boardsizeheightsranked"],
        ["boardsizeheightunranked", "boardsizeheightsunranked"],
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
    testDeprecated(deprecatedArgs, "komis");

    // D - check Warnings :
    checkWarnings("nopause");

    // end of console messages

    function familyArrayFromGeneralArgString(generalArgString) {
        return ["", "ranked", "unranked"].map(e => generalArgString + e);
    }

    function extraRankedUnrankedString(argNameString) {
        if (argNameString.includes("unranked")) {
            return "_unranked";
        } else if (argNameString.includes("ranked")) {
            return "_ranked";
        } else {
            return "";
        }
    }

    function pluralArgNameStringToPluralFamilyString(plural) {
        return plural.split("unranked")[0].split("ranked")[0];
    }

    function allowedExportArgString(argNameString, extraRankedUnranked) {
        return "allowed_" + pluralArgNameStringToPluralFamilyString(argNameString) + extraRankedUnranked;
    }

    function exportBoardsizeIfArgv(familyNameString) {
        let extraRankedUnranked = "";
        for (let argNameString of familyArrayFromGeneralArgString(familyNameString)) {
            if (argv[argNameString]) {
                extraRankedUnranked = extraRankedUnrankedString(argNameString);
                for (let boardsize of argv[argNameString].split(',')) {
                    if (boardsize === "all") {
                        exports["allow_all_boardsizes" + extraRankedUnranked] = true;
                    } else if (boardsize === "custom") {
                        exports["allow_custom_boardsizes" + extraRankedUnranked] = true;
                        for (let width of argv["boardsizewidths" + extraRankedUnranked].split(',')) {
                            exports["allowed_custom_boardsizewidths" + extraRankedUnranked][width] = true;
                        }
                        for (let height of argv["boardsizeheights" + extraRankedUnranked].split(',')) {
                            exports["allowed_custom_boardsizeheights" + extraRankedUnranked][height] = true;
                        }
                    } else {
                        exports[allowedExportArgString(argNameString, extraRankedUnranked)][boardsize] = true;
                    }
                }
            }
        }
    }

    function exportKomiIfArgv(familyNameString) {
        let extraRankedUnranked = "";
        for (let argNameString of familyArrayFromGeneralArgString(familyNameString)) {
            if (argv[argNameString]) {
                extraRankedUnranked = extraRankedUnrankedString(argNameString);
                for (let komi of argv[argNameString].split(',')) {
                    if (komi === "all") {
                        exports["allow_all_komis" + extraRankedUnranked] = true;
                    } else if (komi === "automatic") {
                        exports["allowed_komis" + extraRankedUnranked][null] = true;
                    } else {
                        exports[allowedExportArgString(argNameString, extraRankedUnranked)][komi] = true;
                    }
                }
            }
        }
    }

    function exportIfArgv(familyNameStringsArray) {
        let extraRankedUnranked = "";
        for (let familyNameString of familyNameStringsArray) {
            for (let argNameString of familyArrayFromGeneralArgString(familyNameString)) {
                if (argv[argNameString]) {
                    extraRankedUnranked = extraRankedUnrankedString(argNameString);
                    for (let e of argv[argNameString].split(',')) {
                        exports[allowedExportArgString(argNameString, extraRankedUnranked)][e] = true;
                    }
                }
            }
        }
    }

    function parseMinmaxRankFromNameString(rankArgNameString) {
        let re = /(\d+)([kdp])/;
        let results = argv[rankArgNameString].toLowerCase().match(re);

        if (results) {
            if (results[2] === "k") {
                exports[rankArgNameString] = 30 - parseInt(results[1]);
            } else if (results[2] === "d") {
                exports[rankArgNameString] = 30 - 1 + parseInt(results[1]);
            } else if (results[2] === "p") {
                exports[rankArgNameString] = 36 + parseInt(results[1]);
                exports.proonly = true;
            } else {
                console.error(`Invalid ${rankArgNameString} ${argv[rankArgNameString]}`);
                process.exit();
            }
        } else {
            console.error(`Could not parse ${rankArgNameString} ${argv[rankArgNameString]}`);
            process.exit();
        }
    }

    function parseMinmaxrankFamilyNameString(familyNameString) {
        const familyArray = familyArrayFromGeneralArgString(familyNameString);
        if (argv[familyArray[0]] && !argv[familyArray[1]] && !argv[familyArray[2]]) {
            parseMinmaxRankFromNameString(familyArray[0]);
        } else {
            if (argv[familyArray[1]]) {
                parseMinmaxRankFromNameString(familyArray[1]);
            }
            if (argv[familyArray[2]]) {
                parseMinmaxRankFromNameString(familyArray[2]);
            }
        }
    }

    /* console messages functions:

    /  always use exports and not argv for the console checks below: */
    function checkExports(allRankedUnrankedFamilies, rankedUnrankedFamilies, apikeyString, nonSpecificArgs) {
        console.log("SHOW ARGUMENTS SELECTION AND EXPORTS:\n-------------------------------------------------------");
        let familyArray = [];
        let rankedArgValue = "";
        let unrankedArgValue = "";
        // all / ranked / unranked exports :
        for (let familyNameString of allRankedUnrankedFamilies) {
            familyArray = familyArrayFromGeneralArgString(familyNameString);
            console.log(`  ${familyArray[0].toUpperCase()}(*): -all: ${exports[familyArray[0]] || "-"}, -ranked: ${exports[familyArray[1]] || "-"}, -unranked: ${exports[familyArray[2]] || "-"}`);
        }
        // ranked / unranked exports :
        for (let familyNameString of rankedUnrankedFamilies) {
            familyArray = familyArrayFromGeneralArgString(familyNameString);
            // for example ["komis", "komisranked", "komisunranked"];
            if (exports[familyArray[0]] && !exports[familyArray[1]] && !exports[familyArray[2]]) {
                rankedArgValue = exports[familyArray[0]];
                unrankedArgValue = exports[familyArray[0]];
            } else {
                rankedArgValue = exports[familyArray[1]] || "-";
                unrankedArgValue = exports[familyArray[2]] || "-";
            }
            console.log(`  ${familyArray[0].toUpperCase()}: -ranked: ${rankedArgValue}, -unranked: ${unrankedArgValue}`);
        }
        /* non specific exports :
        /  first we hide apikey*/
        let hiddenApikey = "-";
        if (exports[apikeyString]) {
            hiddenApikey = "hidden";
        }
        console.log(`  --apikey: ${hiddenApikey}`);
        // then the remaining non specific exports :
        // ex: "persist", "debug", etc.
        for (let nonSpecificArg of nonSpecificArgs) {
            console.log(`  --${nonSpecificArg}: ${exports[nonSpecificArg] || "-"}`);
        }
    }

    function testDeprecated(deprecatedArgs, komisFamilyNameString) {
        console.log("CHECK DEPRECATIONS:\n-------------------------------------------------------");
        let isDeprecated = false;
        for (let [oldName, newName] of deprecatedArgs) {
            if (exports[oldName]) {
                console.log(`  Deprecated: --${oldName} is deprecated, use --${newName} instead.`);
                isDeprecated = true;
            }
        }
        for (let komiArg of familyArrayFromGeneralArgString(komisFamilyNameString)) {
            if (exports[komiArg]) { // check to avoid undefined error if bot admin is not using it
                if (exports[komiArg].split(",").includes("auto")) {
                    console.log(`  Deprecated: --${komiArg} /auto/ is no longer supported, use --${komiArg} /automatic/ instead`);
                    isDeprecated = true;
                }
                if (exports[komiArg].split(",").includes("null")) {
                    console.log(`  Deprecated: --${komiArg} /null/ is no longer supported, use --${komiArg} /automatic/ instead`);
                    isDeprecated = true;
                }
            }
        }
        if (isDeprecated) {
            console.log("ERRORS.\n");
        } else {
            console.log("SUCCESS.\n");
        }
    }

    function checkWarnings(noPauseFamilyString) {
        console.log("CHECK WARNINGS:\n-------------------------------------------------------");
        let familyArray = familyArrayFromGeneralArgString(noPauseFamilyString);
        let isWarning = false;
        /* avoid infinite games
        /  TODO : whenever --maxpausetime and co gets implemented, remove this);*/
        if (!exports[familyArray[0]] && !exports[familyArray[1]] && !exports[familyArray[2]]) {
            isWarning = true;
            console.log(`  Warning: No --${familyArray[0]}, --${familyArray[1]}, nor --${familyArray[2]}, games are likely to last forever`); 
        }
        if (isWarning) {
            console.log("ERRORS.\n");
        } else {
            console.log("SUCCESS.\n");
        }

    }

}
