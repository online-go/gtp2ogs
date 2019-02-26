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

    // console : boot message //
    console.log("\nYou are using gtp2ogs version 6.0\n- For changelog or latest devel updates, please visit https://github.com/online-go/gtp2ogs/tree/devel\n");

    /*** console : DEPRECIATIONS ***/
    console.log("-----DEPRECIATIONS-----");
    this.indicatorConsoleDepreciation = false;

    function depreciatedArgumentIsUsedNewArgumentToUseInstead(depreciatedArgumentUsed, newArgumentToUseInstead, indicatorDepreciation) {
        if (depreciatedArgumentUsed) {
            indicatorDepreciation = true;
            console.log(`Warning: --${depreciatedArgumentUsed} is no longer supported. Use --${newArgumentToUseInstead} instead.\nRead latest up to date available gtp2ogs arguments in OPTIONS-LIST (devel branch) for details : https://github.com/online-go/gtp2ogs/blob/devel/docs/OPTIONS-LIST.md`);
        }
    }

    depreciatedArgumentIsUsedNewArgumentToUseInstead(argv.botid, argv.username, this.indicatorConsoleDepreciation);
    depreciatedArgumentIsUsedNewArgumentToUseInstead(argv.bot, argv.username, this.indicatorConsoleDepreciation);
    depreciatedArgumentIsUsedNewArgumentToUseInstead(argv.id, argv.username, this.indicatorConsoleDepreciation);
    depreciatedArgumentIsUsedNewArgumentToUseInstead(argv.minrankedhandicap, argv.minhandicapranked, this.indicatorConsoleDepreciation);
    depreciatedArgumentIsUsedNewArgumentToUseInstead(argv.minunrankedhandicap, argv.minhandicapunranked, this.indicatorConsoleDepreciation);
    depreciatedArgumentIsUsedNewArgumentToUseInstead(argv.maxrankedhandicap, argv.maxhandicapranked, this.indicatorConsoleDepreciation);
    depreciatedArgumentIsUsedNewArgumentToUseInstead(argv.maxunrankedhandicap, argv.maxhandicapunranked, this.indicatorConsoleDepreciation);
    depreciatedArgumentIsUsedNewArgumentToUseInstead(argv.maxtotalgames, argv.maxconnectedgames, this.indicatorConsoleDepreciation);
    depreciatedArgumentIsUsedNewArgumentToUseInstead(argv.maxactivegames, argv.maxconnectedgamesperuser, this.indicatorConsoleDepreciation);

    function depreciatedArgumentIsUsedNewArgumentToUseInsteadUpToThree(depreciatedArgumentUsed, newArgumentToUseInsteadOne, newArgumentToUseInsteadTwo, newArgumentToUseInsteadThree, indicatorDepreciation) {
        if (depreciatedArgumentUsedOne) {
            indicatorDepreciation = true;
            console.log(`Warning: --${depreciatedArgumentUsed} is no longer supported. Use --${newArgumentToUseInsteadOne} and/or --${newArgumentToUseInsteadTwo} and/or --${newArgumentToUseInsteadThree} instead.\nDefaults are provided for all the new arguments, so you dont need to use them all\nRead latest up to date available gtp2ogs arguments in OPTIONS-LIST (devel branch) for details : https://github.com/online-go/gtp2ogs/blob/devel/docs/OPTIONS-LIST.md`);
        }
    }

    depreciatedArgumentIsUsedNewArgumentToUseInsteadUpToThree(argv.minmaintime, argv.minmaintimeblitz, argv.minmaintimelive, argv.minmaintimecorr, this.indicatorConsoleDepreciation);
    depreciatedArgumentIsUsedNewArgumentToUseInsteadUpToThree(argv.minmaintimeranked, argv.minmaintimeblitzranked, argv.minmaintimeliveranked, argv.minmaintimecorrranked, this.indicatorConsoleDepreciation);
    depreciatedArgumentIsUsedNewArgumentToUseInsteadUpToThree(argv.minmaintimeunranked, argv.minmaintimeblitzunranked, argv.minmaintimeliveunranked, argv.minmaintimecorrunranked, this.indicatorConsoleDepreciation);
    depreciatedArgumentIsUsedNewArgumentToUseInsteadUpToThree(argv.maxmaintime, argv.maxmaintimeblitz, argv.maxmaintimelive, argv.maxmaintimecorr, this.indicatorConsoleDepreciation);
    depreciatedArgumentIsUsedNewArgumentToUseInsteadUpToThree(argv.maxmaintimeranked, argv.maxmaintimeblitzranked, argv.maxmaintimeliveranked, argv.maxmaintimecorrranked, this.indicatorConsoleDepreciation);
    depreciatedArgumentIsUsedNewArgumentToUseInsteadUpToThree(argv.maxmaintimeunranked, argv.maxmaintimeblitzunranked, argv.maxmaintimeliveunranked, argv.maxmaintimecorrunranked, this.indicatorConsoleDepreciation);
    depreciatedArgumentIsUsedNewArgumentToUseInsteadUpToThree(argv.minperiodtime, argv.minperiodtimeblitz, argv.minperiodtimelive, argv.minperiodtimecorr, this.indicatorConsoleDepreciation);
    depreciatedArgumentIsUsedNewArgumentToUseInsteadUpToThree(argv.minperiodtimeranked, argv.minperiodtimeblitzranked, argv.minperiodtimeliveranked, argv.minperiodtimecorrranked, this.indicatorConsoleDepreciation);
    depreciatedArgumentIsUsedNewArgumentToUseInsteadUpToThree(argv.minperiodtimeunranked, argv.minperiodtimeblitzunranked, argv.minperiodtimeliveunranked, argv.minperiodtimecorrunranked, this.indicatorConsoleDepreciation);
    depreciatedArgumentIsUsedNewArgumentToUseInsteadUpToThree(argv.maxperiodtime, argv.maxperiodtimeblitz, argv.maxperiodtimelive, argv.maxperiodtimecorr, this.indicatorConsoleDepreciation);
    depreciatedArgumentIsUsedNewArgumentToUseInsteadUpToThree(argv.maxperiodtimeranked, argv.maxperiodtimeblitzranked, argv.maxperiodtimeliveranked, argv.maxperiodtimecorrranked, this.indicatorConsoleDepreciation);
    depreciatedArgumentIsUsedNewArgumentToUseInsteadUpToThree(argv.maxperiodtimeunranked, argv.maxperiodtimeblitzunranked, argv.maxperiodtimeliveunranked, argv.maxperiodtimecorrunranked, this.indicatorConsoleDepreciation);

    function isArgumentToArrayEqualToAuto(argumentToTest, indicatorDepreciation) {
        /* we add a if(argumentToTest) before the "auto" test
        so that we do the test only if argument is defined (used by bot admin) */
        if (argumentToTest) {
            for (let e of argumentToTest.split(",")) {
                if (e === "auto") {
                    indicatorDepreciation = true;
                    console.log(`Warning: /--${argumentToTest} auto/ has been renamed to /--${argumentToTest} automatic/\nRead latest up to date available gtp2ogs arguments in OPTIONS-LIST (devel branch) for details : https://github.com/online-go/gtp2ogs/blob/devel/docs/OPTIONS-LIST.md`); 
                }
                if (e === "null") {
                    indicatorDepreciation = true;
                    console.log(`Warning: /--${argumentToTest} null/ has been renamed to /--${argumentToTest} automatic/\nRead latest up to date available gtp2ogs arguments in OPTIONS-LIST (devel branch) for details : https://github.com/online-go/gtp2ogs/blob/devel/docs/OPTIONS-LIST.md`); 
                }
            }
        }
    }

    isArgumentToArrayEqualToAuto(argv.komi, this.indicatorConsoleDepreciation);
    isArgumentToArrayEqualToAuto(argv.komiranked, this.indicatorConsoleDepreciation);
    isArgumentToArrayEqualToAuto(argv.komiunranked, this.indicatorConsoleDepreciation);

    // final DEPRECIATIONS [OK!] check indicator : display result
    if (this.indicatorConsoleDepreciation) {
        console.log("result : [DEPRECIATIONS ERROR(S)]\n");
    
    } else {
        console.log("result : [OK!]\n");
    }

    /*** console : WARNINGS, dont use 3 settings of the same family (general, ranked, unranked) at the same time ***/
    console.log("-----GENERAL/RANKED/UNRANKED-----");
    this.indicatorConsoleWarningGeneralRankedUnranked = false;

    function generalArgumentIsUsedWithSpecificAtTheSameTime(generalArgument,rankedArgument,unrankedArgument, indicatorWarningsGeneralRankedUnranked) {
        if (generalArgument && (rankedArgument || unrankedArgument)) {
            indicatorWarningsGeneralRankedUnranked = true;
            console.log(`Warning: You are using --${generalArgument} in combination with --${rankedArgument} and/or --${unrankedArgument}.\n Use either --${generalArgument} alone, OR --${rankedArgument} with --${unrankedArgument}.\nBut dont use both general and specific ranked/unranked arguments at the same time`);
        }
    }

    generalArgumentIsUsedWithSpecificAtTheSameTime(argv.minrank, argv.minrankranked, argv.minrankunranked, this.indicatorConsoleWarningGeneralRankedUnranked);
    generalArgumentIsUsedWithSpecificAtTheSameTime(argv.maxrank, argv.maxrankranked, argv.maxrankunranked, this.indicatorConsoleWarningGeneralRankedUnranked);
    generalArgumentIsUsedWithSpecificAtTheSameTime(argv.boardsize, argv.boardsizeranked, argv.boardsizeunranked, this.indicatorConsoleWarningGeneralRankedUnranked);
    generalArgumentIsUsedWithSpecificAtTheSameTime(argv.komi, argv.komiranked, argv.komiunranked, this.indicatorConsoleWarningGeneralRankedUnranked);
    generalArgumentIsUsedWithSpecificAtTheSameTime(argv.speed, argv.speedranked, argv.speedunranked, this.indicatorConsoleWarningGeneralRankedUnranked);
    generalArgumentIsUsedWithSpecificAtTheSameTime(argv.timecontrol, argv.timecontrolranked, argv.timecontrolunranked, this.indicatorConsoleWarningGeneralRankedUnranked);
    generalArgumentIsUsedWithSpecificAtTheSameTime(argv.minhandicap, argv.minhandicapranked, argv.minhandicapunranked, this.indicatorConsoleWarningGeneralRankedUnranked);
    generalArgumentIsUsedWithSpecificAtTheSameTime(argv.maxhandicap, argv.maxhandicapranked, argv.maxhandicapunranked, this.indicatorConsoleWarningGeneralRankedUnranked);
    generalArgumentIsUsedWithSpecificAtTheSameTime(argv.noautohandicap, argv.noautohandicapranked, argv.noautohandicapunranked, this.indicatorConsoleWarningGeneralRankedUnranked);
    generalArgumentIsUsedWithSpecificAtTheSameTime(argv.minperiods, argv.minperiodsranked, argv.minperiodsunranked, this.indicatorConsoleWarningGeneralRankedUnranked);
    generalArgumentIsUsedWithSpecificAtTheSameTime(argv.maxperiods, argv.maxperiodsranked, argv.maxperiodsunranked, this.indicatorConsoleWarningGeneralRankedUnranked);
    generalArgumentIsUsedWithSpecificAtTheSameTime(argv.nopause, argv.nopauseranked, argv.nopauseunranked, this.indicatorConsoleWarningGeneralRankedUnranked);

    // final WARNINGS GENERAL/RANKED/UNRANKED [OK!] check indicator : display result
    if (this.indicatorConsoleWarningGeneralRankedUnranked) {
        console.log("result : [GENERAL/RANKED/UNRANKED ERROR(S)]\n");
    
    } else {
        console.log("result : [OK!]\n");
    }

    /*** console : OTHER WARNINGS ***/
    console.log("-----OTHER WARNINGS-----");
    this.indicatorConsoleOtherWarnings = false;

    // - other warning : avoid infinite games
    if (!argv.nopause && !argv.nopauseranked && !argv.nopauseunranked) {
        this.indicatorConsoleOtherWarnings = true;
        console.log("Warning : No nopause setting detected, games are likely to last forever"); // TODO : when --maxpausetime gets implemented, replace with "are likely to last for a long time"
    }

    // final OTHER WARNINGS [OK!] check indicator : display result
    if (this.indicatorConsoleOtherWarnings) {
        console.log("result : [OTHER WARNINGS ERROR(S)]\n");
    
    } else {
        console.log("result : [OK!]\n");
    }

    /*** end of console boot messages***/

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
