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
exports.banned_ranked_users = {};
exports.banned_unranked_users = {};
exports.allowed_sizes = [];
exports.allow_all_sizes = false;
exports.allow_custom_sizes = false;
exports.allowed_custom_boardsizewidth = [];
exports.allowed_custom_boardsizeheight = [];
exports.allowed_sizes_ranked = [];
exports.allow_all_sizes_ranked = false;
exports.allow_custom_sizes_ranked = false;
exports.allowed_custom_boardsizewidth_ranked = [];
exports.allowed_custom_boardsizeheight_ranked = [];
exports.allowed_sizes_unranked = [];
exports.allow_all_sizes_unranked = false;
exports.allow_custom_sizes_unranked = false;
exports.allowed_custom_boardsizewidth_unranked = [];
exports.allowed_custom_boardsizeheight_unranked = [];
exports.allow_all_komi = false;
exports.allowed_komi = [];
exports.allow_all_komi_ranked = false;
exports.allowed_komi_ranked = [];
exports.allow_all_komi_unranked = false;
exports.allowed_komi_unranked = [];
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
        .describe('boardsize', 'Board size(s) to accept')
        .string('boardsize')
        .default('boardsize', '9,13,19')
        .describe('boardsizeranked', 'Board size(s) to accept for ranked games')
        .string('boardsizeranked')
        .describe('boardsizeunranked', 'Board size(s) to accept for unranked games')
        .string('boardsizeunranked')
        .describe('boardsizewidth', 'For custom board size(s), specify boardsize width to accept, for example 25')
        .string('boardsizewidth')
        .describe('boardsizeheight', 'For custom board size(s), specify boardsize height to accept, for example 1')
        .string('boardsizeheight')
        .describe('boardsizewidthranked', 'For custom board size(s), specify boardsize width to accept for ranked games, for example 25')
        .string('boardsizewidthranked')
        .describe('boardsizeheightranked', 'For custom board size(s), specify boardsize height to accept for ranked games, for example 1')
        .string('boardsizeheightranked')
        .describe('boardsizewidthunranked', 'For custom board size(s), specify boardsize width to accept for unranked games, for example 25')
        .string('boardsizewidthunranked')
        .describe('boardsizeheightunranked', 'For custom board size(s), specify boardsize height to accept for unranked games, for example 1')
        .string('boardsizeheightunranked')
        // behaviour : --boardsize can be specified as 
        // "custom" (allows board with custom size width x height),
        // "all" (allows ALL boardsizes), 
        // or for square boardsizes only (same width x height) comma separated list of explicit values.
        // The default is "9,13,19" (square board sizes only), see README for details
        .describe('komi', 'Allowed komi values')
        .string('komi')
        .default('komi', 'automatic')
        .describe('komiranked', 'Allowed komi values for ranked games')
        .string('komiranked')
        .describe('komiunranked', 'Allowed komi values for unranked games')
        .string('komiunranked')
        // behaviour: --komi may be specified as 
        // "automatic" (accept automatic komi)
        // "all" (accept all komi values), 
        // or comma separated list of explicit values.
        // The default is "automatic", see README and OPTIONS-LIST for details
        .describe('ban', 'Comma separated list of user names or IDs')
        .string('ban')
        .describe('banranked', 'Comma separated list of user names or IDs')
        .string('banranked')
        .describe('banunranked', 'Comma separated list of user names or IDs')
        .string('banunranked')
        .describe('speed', 'Game speed(s) to accept')
        .default('speed', 'blitz,live,correspondence')
        .describe('speedranked', 'Game speed(s) to accept for ranked games')
        .describe('speedunranked', 'Game speed(s) to accept for unranked games')
        .describe('timecontrol', 'Time control(s) to accept')
        .default('timecontrol', 'fischer,byoyomi,simple,canadian')
        .describe('timecontrolranked', 'Time control(s) to accept for ranked games')
        .describe('timecontrolunranked', 'Time control(s) to accept for unranked games')
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
        .describe('minperiods', 'Minimum number of periods')
        .default('minperiods', 3)
        .describe('minperiodsranked', 'Minimum number of ranked periods')
        .describe('minperiodsunranked', 'Minimum number of unranked periods')
        .describe('maxperiods', 'Maximum number of periods')
        .default('maxperiods', 20)
        .describe('maxperiodsranked', 'Maximum number of ranked periods')
        .describe('maxperiodsunranked', 'Maximum number of unranked periods')
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

    // - warning : dont use 3 settings of the same family (general, ranked, unranked) at the same time
    if (argv.maxhandicap && (argv.maxhandicapranked || argv.maxhandicapunranked)) {
        console.log("Warning: You are using --maxhandicap in combination with --maxhandicapranked and/or --maxhandicapunranked.\nUse either --maxhandicap alone, OR --maxhandicapranked with --maxhandicapunranked.\nBut don't use the 3 maxhandicap arguments at the same time.");
    }

    if (argv.minhandicap && (argv.minhandicapranked || argv.minhandicapunranked)) {
        console.log("Warning: You are using --minhandicap in combination with --minhandicapranked and/or --minhandicapunranked.\nUse either --minhandicap alone, OR --minhandicapranked with --minhandicapunranked. \nBut don't use the 3 minhandicap arguments at the same time.");
    }

    if (argv.noautohandicap && (argv.noautohandicapranked || argv.noautohandicapunranked)) {
        console.log("Warning: You are using --noautohandicap in combination with --noautohandicapranked and/or --noautohandicapunranked.\nUse either --noautohandicap alone, OR --noautohandicapranked with --noautohandicapunranked.\nBut don't use the 3 noautohandicap arguments at the same time.");
    }

    if (argv.maxperiods && (argv.maxperiodsranked || argv.maxperiodsunranked)) {
        console.log("Warning: You are using --maxperiods in combination with --maxperiodsranked and/or --maxperiodsunranked.\nUse either --maxperiods alone, OR --maxperiodsranked with --maxperiodsunranked.\nBut don't use the 3 maxperiods arguments at the same time.");
    }

    if (argv.minperiods && (argv.minperiodsranked || argv.minperiodsunranked)) {
        console.log("Warning: You are using --minperiods in combination with --minperiodsranked and/or --minperiodsunranked.\nUse either --minperiods alone, OR --minperiodsranked with --minperiodsunranked.\nBut don't use the 3 minperiods arguments at the same time.");
    }

    if (argv.minrank && (argv.minrankranked || argv.minrankunranked)) {
        console.log("Warning: You are using --minrank in combination with --minrankranked and/or --minrankunranked. \n Use either --minrank alone, OR --minrankranked with --minrankunranked.\nBut don't use the 3 minrank arguments at the same time.");
    }

    if (argv.maxrank && (argv.maxrankranked || argv.maxrankunranked)) {
        console.log("Warning: You are using --maxrank in combination with --maxrankranked and/or --maxrankunranked. \n Use either --maxrank alone, OR --maxrankranked with --maxrankunranked.\nBut don't use the 3 maxrank arguments at the same time.");
    }

    if (argv.nopause && (argv.nopauseranked || argv.nopauseunranked)) {
        console.log("Warning: You are using --nopause in combination with --nopauseranked and/or --nopauseunranked. \n Use either --nopause alone, OR --nopauseranked with --nopauseunranked.\nBut don't use the 3 nopause arguments at the same time.");
    }

    console.log("\n"); /*after final warning, we skip a line to make it more pretty*/

    // - warning : avoid infinite games

    if (!argv.nopause && !argv.nopauseranked && !argv.nopauseunranked) {
        console.log("Warning : No nopause setting detected, games are likely to last forever"); // TODO : when --maxpaustime and co gets implemented, replace with "are likely to last for a long time"
    }
    

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
      ["minperiodtimeunranked", "minperiodtimeblitzunranked, --minperiodtimeliveunranked and/or --minperiodtimecorrunranked"]
      ]
    deprecatedArgs.forEach(ar => testDeprecated(...ar))

    function familyArrayFromGeneralArg(generalArg) {
        return ["", "unranked", "ranked" ].map(e => generalArg + e);
    }

    for (let e of familyArrayFromGeneralArg("komi")) {
        if (argv[e]) { // we add a check here to avoid undefined error if bot admin is not using this argv
        // for example if argv[komiranked]
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

    if (argv.ban) {
        for (let i of argv.ban.split(',')) {
            exports.banned_users[i] = true;
        }
    }

    if (argv.banranked) {
        for (let i of argv.banranked.split(',')) {
            exports.banned_ranked_users[i] = true;
        }
    }

    if (argv.banunranked) {
        for (let i of argv.banunranked.split(',')) {
            exports.banned_unranked_users[i] = true;
        }
    }

    if (argv.minrank && !argv.minrankranked && !argv.minrankunranked) {
        let re = /(\d+)([kdp])/;
        let results = argv.minrank.toLowerCase().match(re);

        if (results) {
            if (results[2] === "k") {
                exports.minrank = 30 - parseInt(results[1]);
            } else if (results[2] === "d") {
                exports.minrank = 30 - 1 + parseInt(results[1]);
            } else if (results[2] === "p") {
                exports.minrank = 36 + parseInt(results[1]);
                exports.proonly = true;
            } else {
                console.error("Invalid minrank " + argv.minrank);
                process.exit();
            }
        } else {
            console.error("Could not parse minrank " + argv.minrank);
            process.exit();
        }
    }

    if (argv.minrankranked) {
        let re = /(\d+)([kdp])/;
        let results = argv.minrank.toLowerCase().match(re);

        if (results) {
            if (results[2] === "k") {
                exports.minrankranked = 30 - parseInt(results[1]);
            } else if (results[2] === "d") {
                exports.minrankranked = 30 - 1 + parseInt(results[1]);
            } else if (results[2] === "p") {
                exports.minrankranked = 36 + parseInt(results[1]);
                exports.proonly = true;
            } else {
                console.error("Invalid minrankranked " + argv.minrankranked);
                process.exit();
            }
        } else {
            console.error("Could not parse minrankranked " + argv.minrankranked);
            process.exit();
        }
    }

    if (argv.minrankunranked) {
        let re = /(\d+)([kdp])/;
        let results = argv.minrankunranked.toLowerCase().match(re);

        if (results) {
            if (results[2] === "k") {
                exports.minrankunranked = 30 - parseInt(results[1]);
            } else if (results[2] === "d") {
                exports.minrankunranked = 30 - 1 + parseInt(results[1]);
            } else if (results[2] === "p") {
                exports.minrankunranked = 36 + parseInt(results[1]);
                exports.proonly = true;
            } else {
                console.error("Invalid minrankunranked " + argv.minrankunranked);
                process.exit();
            }
        } else {
            console.error("Could not parse minrankunranked " + argv.minrankunranked);
            process.exit();
        }
    }

    if (argv.maxrank && !argv.maxrankranked && !argv.maxrankunranked) {
        let re = /(\d+)([kdp])/;
        let results = argv.maxrank.toLowerCase().match(re);

        if (results) {
            if (results[2] === "k") {
                exports.maxrank = 30 - parseInt(results[1]);
            } else if (results[2] === "d") {
                exports.maxrank = 30 - 1 + parseInt(results[1]);
            } else if (results[2] === "p") {
                exports.maxrank = 36 + parseInt(results[1]);
            } else {
                console.error("Invalid maxrank " + argv.maxrank);
                process.exit();
            }
        } else {
            console.error("Could not parse maxrank " + argv.maxrank);
            process.exit();
        }
    }

    if (argv.maxrankranked) {
        let re = /(\d+)([kdp])/;
        let results = argv.maxrankranked.toLowerCase().match(re);

        if (results) {
            if (results[2] === "k") {
                exports.maxrankranked = 30 - parseInt(results[1]);
            } else if (results[2] === "d") {
                exports.maxrankranked = 30 - 1 + parseInt(results[1]);
            } else if (results[2] === "p") {
                exports.maxrankranked = 36 + parseInt(results[1]);
            } else {
                console.error("Invalid maxrankranked " + argv.maxrankranked);
                process.exit();
            }
        } else {
            console.error("Could not parse maxrankranked " + argv.maxrankranked);
            process.exit();
        }
    }

    if (argv.maxrankunranked) {
        let re = /(\d+)([kdp])/;
        let results = argv.maxrankunranked.toLowerCase().match(re);

        if (results) {
            if (results[2] === "k") {
                exports.maxrankunranked = 30 - parseInt(results[1]);
            } else if (results[2] === "d") {
                exports.maxrankunranked = 30 - 1 + parseInt(results[1]);
            } else if (results[2] === "p") {
                exports.maxrankunranked = 36 + parseInt(results[1]);
            } else {
                console.error("Invalid maxrankunranked " + argv.maxrankunranked);
                process.exit();
            }
        } else {
            console.error("Could not parse maxrankunranked " + argv.maxrankunranked);
            process.exit();
        }
    }

    if (argv.boardsize) {
        for (let boardsize of argv.boardsize.split(',')) {
            if (boardsize === "all") {
                exports.allow_all_sizes = true;
            } else if (boardsize === "custom") {
                exports.allow_custom_sizes = true;
                for (let boardsizewidth of argv.boardsizewidth.split(',')) {
                    exports.allowed_custom_boardsizewidth[boardsizewidth] = true;
                }
                for (let boardsizeheight of argv.boardsizeheight.split(',')) {
                    exports.allowed_custom_boardsizeheight[boardsizeheight] = true;
                }
            } else {
                exports.allowed_sizes[boardsize] = true;
            }
        }
    }

    if (argv.boardsizeranked) {
        for (let boardsizeranked of argv.boardsizeranked.split(',')) {
            if (boardsizeranked === "all") {
                exports.allow_all_sizes_ranked = true;
            } else if (boardsizeranked === "custom") {
                exports.allow_custom_sizes_ranked = true;
                for (let boardsizewidthranked of argv.boardsizewidthranked.split(',')) {
                    exports.allowed_custom_boardsizewidth_ranked[boardsizewidthranked] = true;
                }
                for (let boardsizeheightranked of argv.boardsizeheightranked.split(',')) {
                    exports.allowed_custom_boardsizeheight_ranked[boardsizeheightranked] = true;
                }
            } else {
                exports.allowed_sizes_ranked[boardsizeranked] = true;
            }
        }
    }

    if (argv.boardsizeunranked) {
        for (let boardsizeunranked of argv.boardsizeunranked.split(',')) {
            if (boardsizeunranked === "all") {
                exports.allow_all_sizes_unranked = true;
            } else if (boardsizeunranked === "custom") {
                exports.allow_custom_sizes_unranked = true;
                for (let boardsizewidthunranked of argv.boardsizewidthunranked.split(',')) {
                    exports.allowed_custom_boardsizewidth_unranked[boardsizewidthunranked] = true;
                }
                for (let boardsizeheightunranked of argv.boardsizeheightunranked.split(',')) {
                    exports.allowed_custom_boardsizeheight_unranked[boardsizeheightunranked] = true;
                }
            } else {
                exports.allowed_sizes_unranked[boardsizeunranked] = true;
            }
        }
    }

    if (argv.komi) {
        for (let komi of argv.komi.split(',')) {
            if (komi === "all") {
                exports.allow_all_komi = true;
            } else if (komi === "automatic") {
                exports.allowed_komi[null] = true;
            } else {
                exports.allowed_komi[komi] = true;
            }
        }
    }

    if (argv.komiranked) {
        for (let komiranked of argv.komiranked.split(',')) {
            if (komiranked === "all") {
                exports.allow_all_komi_ranked = true;
            } else if (komiranked === "automatic") {
                exports.allowed_komi_ranked[null] = true;
            } else {
                exports.allowed_komi_ranked[komiranked] = true;
            }
        }
    }

    if (argv.komiunranked) {
        for (let komiunranked of argv.komiunranked.split(',')) {
            if (komiunranked === "all") {
                exports.allow_all_komi_unranked = true;
            } else if (komiunranked === "automatic") {
                exports.allowed_komi_unranked[null] = true;
            } else {
                exports.allowed_komi_unranked[komiunranked] = true;
            }
        }
    }

    if (argv.speed) {
        for (let i of argv.speed.split(',')) {
            exports.allowed_speeds[i] = true;
        }
    }

    if (argv.speedranked) {
        for (let i of argv.speedranked.split(',')) {
            exports.allowed_speeds_ranked[i] = true;
        }
    }

    if (argv.speedunranked) {
        for (let i of argv.speedunranked.split(',')) {
            exports.allowed_speeds_unranked[i] = true;
        }
    }

    if (argv.timecontrol) {
        for (let i of argv.timecontrol.split(',')) {
            exports.allowed_timecontrols[i] = true;
        }
    }

    if (argv.timecontrolranked) {
        for (let i of argv.timecontrolranked.split(',')) {
            exports.allowed_timecontrols_ranked[i] = true;
        }
    }

    if (argv.timecontrolunranked) {
        for (let i of argv.timecontrolunranked.split(',')) {
            exports.allowed_timecontrols_unranked[i] = true;
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
}
