let fs = require('fs')
let console = require('console');

exports.DEBUG = false;
exports.PERSIST = false;
exports.KGSTIME = false;
exports.NOCLOCK = false;
exports.GREETING = "";
exports.FAREWELL = "";
exports.REJECTNEWMSG = "";

exports.check_rejectnew = function() {};
exports.banned_users = {};
exports.banned_ranked_users = {};
exports.banned_unranked_users = {};
exports.allow_all_komi = false;
exports.allowed_komi = [];
exports.allowed_sizes = [];
exports.allowed_timecontrols = {};
exports.allowed_speeds = {};
exports.allow_all_sizes = false;
exports.allow_custom_sizes = false;
exports.allowed_custom_boardsizewidth = [];
exports.allowed_custom_boardsizeheight = [];
exports.allowed_sizes = [];

exports.updateFromArgv = function() {
    let optimist = require("optimist")
        .usage("Usage: $0 --username <bot-username> --apikey <apikey> [arguments] -- botcommand [bot arguments]")
        .alias('username', 'u')
        .alias('apikey', 'a')
        .alias('debug', 'd')
        .alias('logfile', 'l')
        .alias('json', 'j')
        .alias('hidden', 'h')
        .alias('greeting', 'g')
        .alias('farewell', 'f')
        .alias('persist', 'p')
        .alias('timeout', 't')
        .alias('speed', 's')
        .alias('komi', 'k')
        .alias('rejectnew', 'r')
        .alias('rejectnewmsg', 'rm')
        .alias('rejectnewfile', 'rf')
        .alias('noclock', 'nc')
        .alias('nopause', 'np')
        .alias('nopauseranked', 'npr')
        .alias('nopauseunranked', 'npu')
        .alias('noautohandicap', 'nah')
        .alias('noautohandicapranked', 'nahr')
        .alias('noautohandicapunranked', 'nahu')
        .alias('rankedonly', 'ro')
        .alias('unrankedonly', 'uo')
        .alias('proonly', 'po')
        .alias('ban', 'b')
        .alias('banranked', 'br')
        .alias('banunranked', 'bu')
        .alias('corrqueue', 'cq')
        .alias('startupbuffer', 'sb')
        .alias('timecontrol', 'tc')
        // alias bb is for square boardsizes only, hence the double b (width x height)
        .alias('boardsize', 'bb')
        .alias('boardsizewidth', 'bw')
        .alias('boardsizeheight', 'bh')
        // for below aliases : 0 is min , 1 is max,
        .alias('maxconnectedgames', '1cg')
        .alias('maxconnectedgamesperuser', '1cgpu')
        .alias('minrank', '0r')
        .alias('minrankranked', '0rr')
        .alias('minrankunranked', '0ru')
        .alias('maxrank', '1r')
        .alias('maxrankranked', '1rr')
        .alias('maxrankunranked', '1ru')
        .alias('minmaintime', '0mt')
        .alias('maxmaintime', '1mt')
        .alias('minmaintimeranked', '0mtr')
        .alias('maxmaintimeranked', '1mtr')
        .alias('minmaintimeunranked', '0mtu')
        .alias('maxmaintimeunranked', '1mtu')
        .alias('minperiodtime', '0pt')
        .alias('maxperiodtime', '1pt')
        .alias('minperiodtimeranked', '0ptr')
        .alias('maxperiodtimeranked', '1ptr')
        .alias('minperiodtimeunranked', '0ptu')
        .alias('maxperiodtimeunranked', '1ptu')
        .alias('minperiods', '0p')
        .alias('maxperiods', '1p')
        .alias('minperiodsranked', '0pr')
        .alias('minperiodsunranked', '0pu')
        .alias('maxperiodsranked', '1pr')
        .alias('maxperiodsunranked', '1pu')
        .alias('minhandicap', '0h')
        .alias('maxhandicap', '1h')
        .alias('minhandicapranked', '0hr')
        .alias('minhandicapunranked', '0hu')
        .alias('maxhandicapranked', '1hr')
        .alias('maxhandicapunranked', '1hu')
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
        .describe('noclock', 'Do not send any clock/time data to the bot')
        .describe('persist', 'Bot process remains running between moves')
        .describe('corrqueue', 'Process correspondence games one at a time')
        .describe('maxconnectedgames', 'Maximum number of total games')
        .default('maxconnectedgames', 20)
        // maxconnectedgames is actually the maximum total number of connected games for all users 
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
        .string('boardsizewidth')
        .describe('boardsizewidth', 'For custom board size(s) to accept, specify boardsize width, for example 25')
        .string('boardsizeheight')
        .describe('boardsizeheight', 'For custom board size(s) to accept, specify boardsize height, for example 1')
        // behaviour : --boardsize can be specified as 
        // "custom" (allows board with custom size width x height),
        // "all" (allows ALL boardsizes), 
        // or for square boardsizes only (same width x height) comma separated list of explicit values.
        // The default is "9,13,19" (square board sizes only), see README for details
        .describe('komi', 'Allowed komi values')
        .string('komi')
        .default('komi', 'auto')
        // behaviour: --komi may be specified as 
        // "auto" (Automatic), 
        // "all" (accept all komi values), 
        // or comma separated list of explicit values.
        // The default is "auto", see README for details
        .describe('ban', 'Comma separated list of user names or IDs')
        .string('ban')
        .describe('banranked', 'Comma separated list of user names or IDs')
        .string('banranked')
        .describe('banunranked', 'Comma separated list of user names or IDs')
        .string('banunranked')
        .describe('speed', 'Game speed(s) to accept')
        .default('speed', 'blitz,live,correspondence')
        .describe('timecontrol', 'Time control(s) to accept')
        .default('timecontrol', 'fischer,byoyomi,simple,canadian,absolute,none')
        .describe('minmaintime', 'Minimum seconds of main time (rejects time control simple and none)')
        .default('minmaintime', 60)
        .describe('maxmaintime', 'Maximum seconds of main time (rejects time control simple and none)')
        .default('maxmaintime', 1800)
        .describe('minmaintimeranked', 'Minimum seconds of main time for ranked games (rejects time control simple and none)')
        .describe('maxmaintimeranked', 'Maximum seconds of main time for ranked games (rejects time control simple and none)')
        .describe('minmaintimeunranked', 'Minimum seconds of main time for unranked games (rejects time control simple and none)')
        .describe('maxmaintimeunranked', 'Maximum seconds of main time for unranked games (rejects time control simple and none)')
        .describe('minperiodtime', 'Minimum seconds per period (per stone in canadian)')
        .default('minperiodtime', 5)
        .describe('maxperiodtime', 'Maximum seconds per period (per stone in canadian)')
        .default('minperiodtime', 120)
        .describe('minperiodtimeranked', 'Minimum seconds per period for ranked games (per stone in canadian)')
        .describe('maxperiodtimeranked', 'Maximum seconds per period for unranked games (per stone in canadian)')
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

    if (!argv._ || argv._.length == 0) {
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

if (argv.maxmaintime && (argv.maxmaintimeranked || argv.maxmaintimeunranked)) {
    console.log("Warning: You are using --maxmaintime in combination with --maxmaintimeranked and/or --maxmaintimeunranked.\nUse either --maxmaintime alone, OR --maxmaintimeranked with --maxmaintimeunranked.\nBut don't use the 3 maxmaintime arguments at the same time.");
}

if (argv.minmaintime && (argv.minmaintimeranked || argv.minmaintimeunranked)) {
    console.log("Warning: You are using --minmaintime in combination with --minmaintimeranked and/or --minmaintimeunranked.\nUse either --minmaintime alone, OR --minmaintimeranked with --minmaintimeunranked.\nBut don't use the 3 minmaintime arguments at the same time.");
}

if (argv.maxperiods && (argv.maxperiodsranked || argv.maxperiodsunranked)) {
    console.log("Warning: You are using --maxperiods in combination with --maxperiodsranked and/or --maxperiodsunranked.\nUse either --maxperiods alone, OR --maxperiodsranked with --maxperiodsunranked.\nBut don't use the 3 maxperiods arguments at the same time.");
}

if (argv.minperiods && (argv.minperiodsranked || argv.minperiodsunranked)) {
    console.log("Warning: You are using --minperiods in combination with --minperiodsranked and/or --minperiodsunranked.\nUse either --minperiods alone, OR --minperiodsranked with --minperiodsunranked.\nBut don't use the 3 minperiods arguments at the same time.");
}

if (argv.maxperiodtime && (argv.maxperiodtimeranked || argv.maxperiodtimeunranked)) {
    console.log("Warning: You are using --maxperiodtime in combination with --maxperiodtimeranked and/or --maxperiodtimeunranked.\nUse either --maxperiodtime alone, OR --maxperiodtimeranked with --maxperiodtimeunranked.\nBut don't use the 3 maxperiodtime arguments at the same time.");
}

if (argv.minperiodtime && (argv.minperiodtimeranked || argv.minperiodtimeunranked)) {
    console.log("Warning: You are using --minperiodtime in combination with --minperiodtimeranked and/or --minperiodtimeunranked.\nUse either --minperiodtime alone, OR --minperiodtimeranked with --minperiodtimeunranked.\nBut don't use the 3 minperiodtime arguments at the same time.");
}

if (argv.minrank && (argv.minrankranked || argv.minrankunranked)) {
    console.log("Warning: You are using --minrank in combination with --minrankranked and/or --minrankunranked. \n Use either --minrank alone, OR --minrankranked with --minrankunranked.\nBut don't use the 3 minrank arguments at the same time.");
}

if (argv.maxrank && (argv.maxrankranked || argv.maxrankunranked)) {
    console.log("Warning: You are using --maxrank in combination with --maxrankranked and/or --maxrankunranked. \n Use either --maxrank alone, OR --maxrankranked with --maxrankunranked.\nBut don't use the 3 maxrank arguments at the same time.");
}

if (argv.ban && (argv.banranked || argv.banunranked)) {
    console.log("Warning: You are using --ban in combination with --banranked and/or --banunranked. \n Use either --ban alone, OR --banranked with --banunranked.\nBut don't use the 3 ban arguments at the same time.");
}

if (argv.nopause && (argv.nopauseranked || argv.nopauseunranked)) {
    console.log("Warning: You are using --nopause in combination with --nopauseranked and/or --nopauseunranked. \n Use either --nopause alone, OR --nopauseranked with --nopauseunranked.\nBut don't use the 3 nopause arguments at the same time.");
}

console.log("\n"); /*after final warning, we skip a line to make it more pretty*/

// - warning : avoid infinite games

if (!argv.nopause && !argv.nopauseranked && !argv.nopauseunranked) {
    console.log("Warning : No nopause setting detected, games are likely to last forever"); // TODO : when --maxpaustime and co gets implemented, replace with "are likely to last for a long time"
}
console.log("\n"); /*after last warning, we skip a line to make it more pretty*/

// - warning : depreciated features if used

if (argv.botid) {
    console.log("Warning: --botid alias is no longer supported. Use --username instead.");
}

if (argv.bot) {
    console.log("Warning: --bot alias is no longer supported. Use --username instead.");
}

if (argv.id) {
    console.log("Warning: --id alias is no longer supported. Use --username instead.");
}

if (argv.minrankedhandicap) {
    console.log("Warning: --minrankedhandicap argument is no longer supported. Use --minhandicapranked instead.");
}

if (argv.maxrankedhandicap) {
    console.log("Warning: --minrankedhandicap argument is no longer supported. Use --maxhandicapranked instead.");
}

if (argv.minunrankedhandicap) {
    console.log("Warning: --minrankedhandicap argument is no longer supported. Use --minhandicapunranked instead.");
}

if (argv.maxunrankedhandicap) {
    console.log("Warning: --minrankedhandicap argument is no longer supported. Use --maxhandicapunranked instead.");
}

if (argv.maxtotalgames) {
    console.log("Warning: --maxtotalgames argument has been renamed to --maxconnectedgames. Use --maxconnectedgames instead.");
}

if (argv.maxactivegames) {
    console.log("Warning: --maxactivegames argument has been renamed to --maxconnectedgamesperuser. Use --maxconnectedgamesperuser instead.");
}

if (argv.botid || argv.bot || argv.id || argv.minrankedhandicap || argv.maxrankedhandicap || argv.minunrankedhandicap || argv.maxunrankedhandicap || argv.maxtotalgames || argv.maxactivegames) {
    console.log("\n"); /*IF there is a warning, we skip a line to make it more pretty*/
}

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

    if (argv.noclock) {
        exports.NOCLOCK = true;
    }

    exports.check_rejectnew = function()
    {
        if (argv.rejectnew)  return true;
        if (argv.rejectnewfile && fs.existsSync(argv.rejectnewfile))  return true;
        return false;
    }

    if (argv.ban && !argv.banranked && !argv.banunranked) {
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
            if (results[2] == "k") {
                exports.minrank = 30 - parseInt(results[1]);
            } else if (results[2] == "d") {
                exports.minrank = 30 - 1 + parseInt(results[1]);
            } else if (results[2] == "p") {
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
            if (results[2] == "k") {
                exports.minrankranked = 30 - parseInt(results[1]);
            } else if (results[2] == "d") {
                exports.minrankranked = 30 - 1 + parseInt(results[1]);
            } else if (results[2] == "p") {
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
            if (results[2] == "k") {
                exports.minrankunranked = 30 - parseInt(results[1]);
            } else if (results[2] == "d") {
                exports.minrankunranked = 30 - 1 + parseInt(results[1]);
            } else if (results[2] == "p") {
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
            if (results[2] == "k") {
                exports.maxrank = 30 - parseInt(results[1]);
            } else if (results[2] == "d") {
                exports.maxrank = 30 - 1 + parseInt(results[1]);
            } else if (results[2] == "p") {
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
            if (results[2] == "k") {
                exports.maxrankranked = 30 - parseInt(results[1]);
            } else if (results[2] == "d") {
                exports.maxrankranked = 30 - 1 + parseInt(results[1]);
            } else if (results[2] == "p") {
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
            if (results[2] == "k") {
                exports.maxrankunranked = 30 - parseInt(results[1]);
            } else if (results[2] == "d") {
                exports.maxrankunranked = 30 - 1 + parseInt(results[1]);
            } else if (results[2] == "p") {
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
        for (let i of argv.boardsize.split(',')) {
            exports.allowed_sizes[i] = true;
        }
    }

    if (argv.komi) {
        for (let komi of argv.komi.split(',')) {
            if (komi == "all") {
                exports.allow_all_komi = true;
            } else if (komi == "auto") {
                exports.allowed_komi[null] = true;
            } else {
                exports.allowed_komi[komi] = true;
            }
        }
    }

    if (argv.boardsize) {
        for (let boardsize of argv.boardsize.split(',')) {
            if (boardsize == "all") {
                exports.allow_all_sizes = true;
            } else if (boardsize == "custom") {
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

    if (argv.timecontrol) {
        for (let i of argv.timecontrol.split(',')) {
            exports.allowed_timecontrols[i] = true;
        }
    }


    if (argv.speed) {
        for (let i of argv.speed.split(',')) {
            exports.allowed_speeds[i] = true;
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
