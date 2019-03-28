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

exports.timeout = 0;
exports.corrqueue = false;
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
        // maxconnectedgames is actually the maximum number of connected games for all users 
        // against your bot, which means the maximum number of games your bot can play at the same time 
        // (choose a low number to regulate your computer performance and stability)
        // (correspondence games are currently included in the total connected games count if you use `--persist` )
        .describe('maxconnectedgamesperuser', 'Maximum number of connected games per user against this bot')
        .default('maxconnectedgamesperuser', 3)
        .describe('startupbuffer', 'Subtract this many seconds from time available on first move')
        .default('startupbuffer', 5)
        .describe('rejectnew', 'Reject all new challenges with the default reject message')
        .describe('rejectnewmsg', 'Adds a customized reject message included in quote yourmessage quote')
        .default('rejectnewmsg', 'Currently, this bot is not accepting games, try again later ')
        // behaviour : 1. when only --rejectnew is used, default reject message is printed
        // behaviour : 2. when you want to add a customized reject message, do it like that for example :
        // --rejectnew --rejectnewmsg "this bot is not playing today because blablablah, try again at x time, sorry"
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
        // behaviour : --boardsizes can be specified as 
        // "custom" (allows board with custom size width x height),
        // "all" (allows ALL boardsizes), 
        // or for square boardsizes only (same width x height) comma separated list of explicit values.
        // The default is "9,13,19" (square board sizes only), see README for details
        .describe('komis', 'Allowed komi values')
        .string('komis')
        .default('komis', 'automatic')
        .describe('komisranked', 'Allowed komi values for ranked games')
        .string('komisranked')
        .describe('komisunranked', 'Allowed komi values for unranked games')
        .string('komisunranked')
        // behaviour: --komis may be specified as 
        // "automatic" (accept automatic komi)
        // "all" (accept all komi values), 
        // or comma separated list of explicit values.
        // The default is "automatic", see README and OPTIONS-LIST for details
        .describe('speeds', 'Game speed(s) to accept')
        .default('speeds', 'blitz,live,correspondence')
        .describe('speedsranked', 'Game speed(s) to accept for ranked games')
        .describe('speedsunranked', 'Game speed(s) to accept for unranked games')
        .describe('timecontrols', 'Time control(s) to accept')
        .default('timecontrols', 'fischer,byoyomi,simple,canadian')
        .describe('timecontrolsranked', 'Time control(s) to accept for ranked games')
        .describe('timecontrolsunranked', 'Time control(s) to accept for unranked games')
        // 1- for "absolute", bot admin can allow absolute if want, but then 
        // make sure to increase minmaintimeblitz and minmaintimelive to high values
        // 2 - "none" is not default, can be manually allowed in timecontrol argument
        // but then games will be very very long
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
        // for canadian period times, divide the period time by the number of stones per period
        // for example max periodtime 5 minutes / 25 stones = 5*60 /25 = maxperiodtime = 12
        .describe('minperiodtimeblitz', 'Minimum seconds of period time for blitz games')
        .default('minperiodtimeblitz', '5') // 5 seconds (average time per stone if time control is canadian)
        .describe('maxperiodtimeblitz', 'Maximum seconds of period time for blitz games')
        .default('maxperiodtimeblitz', '10') // 10 seconds (max)  (average time per stone if time control is canadian)
        .describe('minperiodtimeblitzranked', 'Minimum seconds of period time for blitz ranked games ')
        .describe('maxperiodtimeblitzranked', 'Maximum seconds of period time for blitz ranked games ')
        .describe('minperiodtimeblitzunranked', 'Minimum seconds of period time for blitz unranked games ')
        .describe('maxperiodtimeblitzunranked', 'Maximum seconds of period time for blitz unranked games ')
        .describe('minperiodtimelive', 'Minimum seconds of period time for live games')
        .default('minperiodtimelive', '10') // 10 seconds (average time per stone if time control is canadian)
        .describe('maxperiodtimelive', 'Maximum seconds of period time for live games ')
        .default('maxperiodtimelive', '120') // 2 minutes  (average time per stone if time control is canadian)
        .describe('minperiodtimeliveranked', 'Minimum seconds of period time for live ranked games ')
        .describe('maxperiodtimeliveranked', 'Maximum seconds of period time for live ranked games ')
        .describe('minperiodtimeliveunranked', 'Minimum seconds of period time for live unranked games ')
        .describe('maxperiodtimeliveunranked', 'Maximum seconds of period time for live unranked games ')
        .describe('minperiodtimecorr', 'Minimum seconds of period time for correspondence games')
        .default('minperiodtimecorr', '14400') // 4 hours (average time per stone if time control is canadian)
        .describe('maxperiodtimecorr', 'Maximum seconds of period time for correspondence games')
        .default('maxperiodtimecorr', '259200') // 3 days (average time per stone if time control is canadian)
        .describe('minperiodtimecorrranked', 'Minimum seconds of period time for correspondence ranked games ')
        .describe('maxperiodtimecorrranked', 'Maximum seconds of period time for correspondence ranked games ')
        .describe('minperiodtimecorrunranked', 'Minimum seconds of period time for correspondence unranked games ')
        .describe('maxperiodtimecorrunranked', 'Maximum seconds of period time for correspondence unranked games ')
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

    // console : greeting //

    console.log("\nYou are using gtp2ogs version 6.0\n- For changelog or latest devel updates, please visit https://github.com/online-go/gtp2ogs/tree/devel\n");

    // console : warnings //

    // A - warning : dont use 3 settings of the same family (general, ranked, unranked) at the same time
    const familyArgs = ["boardsizes", "boardsizewidths", "boardsizeheights", "komis", "speeds", "timecontrols", "minhandicap", "maxhandicap", "noautohandicap", "minmaintimeblitz", "minmaintimelive", "minmaintimecorr", "maxmaintimeblitz", "maxmaintimelive", "maxmaintimecorr", "minperiodsblitz", "minperiodslive", "minperiodscorr", "maxperiodsblitz", "maxperiodslive", "maxperiodscorr", "minperiodtimeblitz", "minperiodtimelive", "minperiodtimecorr", "maxperiodtimeblitz", "maxperiodtimelive", "maxperiodtimecorr", "minrank", "maxrank", "nopause"];
// --bans --bansranked --bansunranked are an exception, do not include here

    function checkThreeSameTimeFamily() {
        for (let e of familyArgs) {
            let familyToTest = familyArrayFromGeneralArg(e);
            // for example ["komis", "komisranked", "komisunranked"];
            if ((argv[familyToTest[0]]) && ((argv[familyToTest[1]]) || (argv[familyToTest[2]]))) {
                console.log(`Warning: You are using --${familyToTest[0]} in combination with --${familyToTest[1]} and/or --${familyToTest[2]}. \n Use either --${familyToTest[0]} alone, OR --${familyToTest[1]} with --${familyToTest[2]}.\nBut don't use the 3 ${familyToTest[0]} arguments at the same time.`);
            }
        }
    }

    checkThreeSameTimeFamily();
    console.log("\n"); /*after final warning, we skip a line to make it more pretty*/

    // B - warning : avoid infinite games
    if (!argv.nopause && !argv.nopauseranked && !argv.nopauseunranked) {
        console.log("Warning : No nopause setting detected, games are likely to last forever"); // TODO : when --maxpausetime and co gets implemented, replace with "are likely to last for a long time"
    }

    // C - warning : check deprecated features    
    function testDeprecated(oldName, newName) {
        if (argv[oldName]) console.log(`Warning: --${oldName} is deprecated, use --${newName} instead.`)
    }

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
        ]
    deprecatedArgs.forEach(ar => testDeprecated(...ar))

    for (let e of familyArrayFromGeneralArg("komi")) {
        if (argv[e]) { // we add a check here to avoid undefined error if bot admin is not using this argv
        // for example if argv[komisranked]
            if (argv[e].split(",").includes("auto")) {
            // we need to split the argv value into an array before the includes test
                console.log(`Warning: /--${e} auto/ is no longer supported, use /--${e} automatic/ instead`);
            }
            if (argv[e].split(",").includes("null")) {
            // we need to split the argv value into an array before the includes test
                console.log(`Warning: /--${e} null/ is no longer supported, use /--${e} automatic/ instead`);
            }
        }
    }
    
    if (deprecatedArgs.some(e => argv[e[0]])) {
        console.log("\n");
    }
    
    console.log("\n");

    // end of console messages

    // Set all the argv
    for(var k in argv) exports[k] = argv[k];

    // Convert timeout to microseconds once here so we don't need to do it each time it is used later.
    //
    if (argv.timeout) {
        exports.timeout = argv.timeout * 1000;
    }

    if (argv.startupbuffer) {
        exports.startupbuffer = argv.startupbuffer * 1000;
    }

    if (argv.beta) {
        exports.host = 'beta.online-go.com';
    }

    if (argv.debug) {
        exports.DEBUG = true;
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

    if (argv.minrank && !argv.minrankranked && !argv.minrankunranked) {
        parseMinmaxRankFromNameString("minrank");
    }
    if (argv.minrankranked) {
        parseMinmaxRankFromNameString("minrankranked");
    }
    if (argv.minrankunranked) {
        parseMinmaxRankFromNameString("minrankunranked");
    }
    if (argv.maxrank && !argv.maxrankranked && !argv.maxrankunranked) {
        parseMinmaxRankFromNameString("maxrank");
    }
    if (argv.maxrankranked) {
        parseMinmaxRankFromNameString("maxrankranked");
    }
    if (argv.maxrankunranked) {
        parseMinmaxRankFromNameString("maxrankunranked");
    }
    if (argv.fakerank) {
        parseMinmaxRankFromNameString("fakerank");
    }
    // TODO : remove fakerank when notification.bot.ranking is server implemented

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
        for (let e of argv.timecontrolunranked.split(',')) {
            exports.allowed_timecontrols_unranked[e] = true;
        }
    }

    if (argv.greeting) {
        exports.GREETING = argv.greeting;
    }
    if (argv.farewell) {
        exports.FAREWELL = argv.farewell;
    }
    if (argv.rejectnewmsg) {
        exports.REJECTNEWMSG = argv.rejectnewmsg;
    }

    exports.bot_command = argv._;

    function familyArrayFromGeneralArg(generalArg) {
        return ["", "unranked", "ranked" ].map(e => generalArg + e);
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

}
