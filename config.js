// vim: tw=120 softtabstop=4 shiftwidth=4

const fs = require('fs')

const { getArgNamesGRU } = require('./utils/getArgNamesGRU');
const { getRankedUnrankedUnderscored } = require('./utils/getRankedUnrankedUnderscored');
const { getFamilyName } = require('./utils/getFamilyName');

const console = require('console');

exports.check_rejectnew = function() {};
exports.banned_users = {};
exports.banned_users_ranked = {};
exports.banned_users_unranked = {};
exports.allowed_boardsizes = [];
exports.allow_all_boardsizes = false;
exports.allowed_boardsizes_ranked = [];
exports.allow_all_boardsizes_ranked = false;
exports.allowed_boardsizes_unranked = [];
exports.allow_all_boardsizes_unranked = false;
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
    const ogsPvAIs = ["LeelaZero", "Sai", "KataGo", "PhoenixGo", "Leela"];

    const optimist = require("optimist")
        // 1) ROOT OPTIONS
        .usage("Usage: $0 --username <bot-username> --apikey <apikey> [gtp2ogs arguments] -- botcommand [bot arguments]")
        .demand('username')
        .demand('apikey')
        .describe('username', 'Specify the username of the bot, for example GnuGo')
        .describe('apikey', 'Specify the API key for the bot')
        .describe('greeting', 'Greeting message to appear in chat at first move (ex: Hello, have a nice game)')
        .string('greeting')
        .describe('greetingbotcommand', `Additional greeting message displaying bot command`)
        .describe('farewell', 'Thank you message to appear in chat at end of game (ex: Thank you for playing)')
        .string('farewell')
        .describe('farewellscore', 'Send the score according to the bot at the end of the game')
        .describe('rejectnew', 'Reject all new challenges with the default reject message')
        .describe('rejectnewmsg', 'Adds a customized reject message included in quote yourmessage quote')
        .default('rejectnewmsg', 'Currently, this bot is not accepting games, try again later ')
        .describe('rejectnewfile', 'Reject new challenges if file exists (checked each time, can use for load-balancing)')
        .describe('debug', 'Output GTP command and responses from your Go engine')
        .describe('ogspv', `Send winrate and variations for supported AIs (${ogsPvAIs.join(', ')})with supported settings`)
        .string('ogspv')
        .describe('aichat', 'Allow bots to send chat messages using `DISCUSSION:` `MALKOVICH:` in stderr')
        .describe('logfile', 'In addition to logging to the console, also log gtp2ogs output to a text file.'
                             + 'Filename argument is optional (using only --logfile will use default filename,'
                             + 'for example gtp2ogs_logfile_2020-05-21T21:40:22.910Z)')
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
        /* note: for maxconnectedgames, correspondence games are currently included
        /  in the maxconnectedgames count if you use `--persist` )*/
        .describe('maxconnectedgames', 'Maximum number of connected games for all users')
        .default('maxconnectedgames', 20)
        .describe('maxconnectedgamesperuser', 'Maximum number of connected games per user against this bot')
        .default('maxconnectedgamesperuser', 3)
        .describe('rankedonly', 'Only accept ranked matches')
        .describe('unrankedonly', 'Only accept unranked matches')
        .describe('fakerank', 'Fake bot ranking to calculate automatic handicap stones number in autohandicap (-1) based on rankDifference between fakerank and user ranking, to fix the bypass minhandicap maxhandicap issue if handicap is -automatic')
        // 2) OPTIONS TO CHECK RANKED/UNRANKED CHALLENGES
        //     2A) ALL/RANKED/UNRANKED FAMILIES
        .describe('bans', 'Comma separated list of usernames or IDs')
        .string('bans')
        .describe('bansranked', 'Comma separated list of usernames or IDs who are banned from ranked games')
        .string('bansranked')
        .describe('bansunranked', 'Comma separated list of usernames or IDs who are banned from unranked games')
        .string('bansunranked')
        //     2B) GENERAL/RANKED/UNRANKED FAMILIES
        //         2B1) ALLOWED FAMILIES
        .describe('boardsizes', 'Board size(s) to accept')
        .string('boardsizes')
        .default('boardsizes', '9,13,19')
        .describe('boardsizesranked', 'Board size(s) to accept for ranked games')
        .string('boardsizesranked')
        .describe('boardsizesunranked', 'Board size(s) to accept for unranked games')
        .string('boardsizesunranked')
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
        //         2B2) GENERIC GENERAL/RANKED/UNRANKED OPTIONS
        .describe('proonly', 'For all games, only accept those from professionals')
        .describe('proonlyranked', 'For ranked games, only accept those from professionals')
        .describe('proonlyunranked', 'For unranked games, only accept those from professionals')
        /* note: - nopause disables pausing DURING games, (game.js), but
        /        - nopauseonweekends rejects challenges BEFORE games (connection.js)
        /          (only for correspondence games)*/
        .describe('nopause', 'Disable pausing during games')
        .describe('nopauseranked', 'Disable pausing during ranked games')
        .describe('nopauseunranked', 'Disable pausing during unranked games')
        .describe('nopauseonweekends', 'Do not accept matches that come with the option -pauses in weekends- (specific to correspondence games)')
        .describe('nopauseonweekendsranked', 'Do not accept ranked matches that come with the option -pauses in weekends- (specific to correspondence games)')
        .describe('nopauseonweekendsunranked', 'Do not accept unranked matches that come with the option -pauses in weekends- (specific to correspondence games)')
        .describe('noautohandicap', 'Do not allow handicap to be set to -automatic-')
        .describe('noautohandicapranked', 'Do not allow handicap to be set to -automatic- for ranked games')
        .describe('noautohandicapunranked', 'Do not allow handicap to be set to -automatic- for unranked games')
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
    const debugStatus = argv.debug ? "ON" : "OFF";
    console.log(`\ngtp2ogs version 6.0`
                + `\n--------------------`
                + `\n- For changelog or latest devel updates, `
                + `please visit https://github.com/online-go/gtp2ogs/tree/devel`
                + `\nDebug status: ${debugStatus}`);
    // B - test unsupported argv //
    testDroppedArgv(argv);
    ensureSupportedOgspvAI(argv.ogspv, ogsPvAIs);

    /* EXPORTS FROM ARGV */
    /* 0) root exports*/
    for (const k in argv) {
        // export everything first, then modify/adjust later
        exports[k] = argv[k];
    }

    /* Add and Modify exports*/
    if (argv.debug) {
        exports.DEBUG = true;
    }
    if (argv.logfile && typeof argv.logfile === "boolean") {
        exports.logfile = `gtp2ogs_logfile_${new Date().toISOString()}`;
    }
    for (const k of ["timeout", "startupbuffer"]) {
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
    if (argv.ogspv) {
        exports.ogspv = argv.ogspv.toUpperCase();
    }
    if (argv.rejectnew) {
        // A bot never accepting new games shouldn't be appearing in the dropdown, polite to our users.
        exports.hidden = true;
    }
    exports.check_rejectnew = function()
    {
        if (argv.rejectnew)  return true;
        if (argv.rejectnewfile && fs.existsSync(argv.rejectnewfile))  return true;
        return false;
    };
    exports.bot_command = argv._;

    /* 2) specifc r_u cases :*/
    processRankExport("minrank", argv);
    processRankExport("minrankranked", argv);
    processRankExport("minrankunranked", argv);

    processRankExport("maxrank", argv);
    processRankExport("maxrankranked", argv);
    processRankExport("maxrankunranked", argv);

    processBansExport("bans", argv);
    processBansExport("bansranked", argv);
    processBansExport("bansunranked", argv);

    processBoardsizesExport("boardsizes", argv);
    processBoardsizesExport("boardsizesranked", argv);
    processBoardsizesExport("boardsizesunranked", argv);

    processKomisExport("komis", argv);
    processKomisExport("komisranked", argv);
    processKomisExport("komisunranked", argv);

    processAllowedFamilyExport("speeds", argv);
    processAllowedFamilyExport("speedsranked", argv);
    processAllowedFamilyExport("speedsunranked", argv);

    processAllowedFamilyExport("timecontrols", argv);
    processAllowedFamilyExport("timecontrolsranked", argv);
    processAllowedFamilyExport("timecontrolsunranked", argv);

    // console messages
    // C - test exports warnings
    testExportsWarnings();

}

function getBLCString(familyName, rankedUnranked) {
    return `${familyName}blitz${rankedUnranked}, --${familyName}live${rankedUnranked} `
           + `and/or --${familyName}corr${rankedUnranked}`;
}

// console messages
function testDroppedArgv(argv) {
    const droppedArgv = [
         [["botid", "bot", "id"], "username"],
         [["minrankedhandicap"], "minhandicapranked"],
         [["minunrankedhandicap"], "minhandicapunranked"],
         [["maxrankedhandicap"], "maxhandicapranked"],
         [["maxunrankedhandicap"], "maxhandicapunranked"],
         [["maxtotalgames"], "maxconnectedgames"],
         [["maxactivegames"], "maxconnectedgamesperuser"],
         [["maxmaintime"],  getBLCString("maxmaintime", "")],
         [["maxmaintimeranked"], getBLCString("maxmaintime", "ranked")],
         [["maxmaintimeunranked"], getBLCString("maxmaintime", "unranked")],
         [["minmaintime"], getBLCString("minmaintime", "")],
         [["minmaintimeranked"], getBLCString("minmaintime", "ranked")],
         [["minmaintimeunranked"], getBLCString("minmaintime", "unranked")],
         [["maxperiodtime"], getBLCString("maxperiodtime", "")],
         [["maxperiodtimeranked"], getBLCString("maxperiodtime", "ranked")],
         [["maxperiodtimeunranked"], getBLCString("maxperiodtime", "unranked")],
         [["minperiodtime"], getBLCString("minperiodtime", "")],
         [["minperiodtimeranked"], getBLCString("minperiodtime", "ranked")],
         [["minperiodtimeunranked"], getBLCString("minperiodtime", "unranked")],
         [["maxperiods"],  getBLCString("maxperiods", "")],
         [["maxperiodsranked"], getBLCString("maxperiods", "ranked")],
         [["maxperiodsunranked"], getBLCString("maxperiods", "unranked")],
         [["minperiods"], getBLCString("minperiods", "")],
         [["minperiodsranked"], getBLCString("minperiods", "ranked")],
         [["minperiodsunranked"], getBLCString("minperiods", "unranked")],
         [["ban"], "bans"],
         [["banranked"], "bansranked"],
         [["banunranked"], "bansunranked"],
         [["boardsize"], "boardsizes"],
         [["boardsizeranked"], "boardsizesranked"],
         [["boardsizeunranked"], "boardsizesunranked"],
         [["boardsizewidths", "boardsizewidthsranked", "boardsizewidthsunranked",
           "boardsizeheights", "boardsizeheightsranked", "boardsizeheightsunranked"], "boardsizes"],
         [["komi"], "komis"],
         [["komiranked"], "komisranked"],
         [["komiunranked"], "komisunranked"],
         [["speed"], "speeds"],
         [["speedranked"], "speedsranked"],
         [["speedunranked"], "speedsunranked"],
         [["timecontrol"], "timecontrols"],
         [["timecontrolranked"], "timecontrolsranked"],
         [["timecontrolunranked"], "timecontrolsunranked"]
    ];
    for (const [oldNames, newName] of droppedArgv) {
        for (const oldName of oldNames) {
            if (argv[oldName]) {
                console.log(`Dropped: --${oldName} is no longer `
                            + `supported, use --${newName} instead.`);
            }
        }
    }
    for (const argName of getArgNamesGRU("komis")) {
        if (argv[argName]) {
            for (const komi of ["auto","null"]) {
                if (argv[argName].split(",").includes(komi)) {
                    console.log(`Dropped: --${argName} ${komi} is no longer `
                                + `supported, use --${argName} automatic instead`);
                }
            }
        }
    }
    console.log("\n");
}

function ensureSupportedOgspvAI(ogspv, ogsPvAIs) {
    // being case tolerant
    if (!ogspv) return;
    const upperCaseOgsPv = ogspv.toUpperCase();
    const upperCaseAIs   = ogsPvAIs.map(e => e.toUpperCase());

    if (!upperCaseAIs.includes(upperCaseOgsPv)) {
        throw `Unsupported --ogspv option ${ogspv}.`
              + `\nSupported options are ${ogsPvAIs.join(', ')}`;
    }
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
            throw `error: could not parse rank -${arg}-`;
        }
    }
}

function processRankExport(argName, argv) {
    const arg = argv[argName];
    if (arg) {
        exports[argName] = parseRank(arg);
    }
}

function processBansExport(argName, argv) {
    const arg = argv[argName];
    const rankedUnrankedUnderscored = getRankedUnrankedUnderscored(argName);

    if (arg) {
        const bans = arg.split(',');
        for (const bannedUser of bans) {
            exports[`banned_users${rankedUnrankedUnderscored}`][bannedUser] = true;
        }
    }
}

function processBoardsizesExport(argName, argv) {
    const arg = argv[argName];
    const rankedUnrankedUnderscored = getRankedUnrankedUnderscored(argName);

    if (arg) {
        const boardsizes = arg.split(',');
        for (const boardsize of boardsizes) {
            if (boardsize === "all") {
                exports[`allow_all_boardsizes${rankedUnrankedUnderscored}`] = true;
            } else {
                exports[`allowed_boardsizes${rankedUnrankedUnderscored}`][boardsize] = true;
            }
        }
    }
}

function processKomisExport(argName, argv) {
    const arg = argv[argName];
    const rankedUnrankedUnderscored = getRankedUnrankedUnderscored(argName);

    if (arg) {
        const komis = arg.split(',');
        for (const komi of komis) {
            if (komi === "all") {
                exports[`allow_all_komis${rankedUnrankedUnderscored}`] = true;
            } else if (komi === "automatic") {
                exports[`allowed_komis${rankedUnrankedUnderscored}`][null] = true;
            } else {
                exports[`allowed_komis${rankedUnrankedUnderscored}`][komi] = true;
            }
        }
    } 
}

function processAllowedFamilyExport(argName, argv) {
    const arg = argv[argName];
    const rankedUnrankedUnderscored = getRankedUnrankedUnderscored(argName);

    if (arg) {
        const familyName = getFamilyName(argName);
        const allowedValues = arg.split(',');
        for (const allowedValue of allowedValues) {
            if (allowedValue === "all") {
                exports[`allow_all_${familyName}${rankedUnrankedUnderscored}`] = true;
            } else {
                exports[`allowed_${familyName}${rankedUnrankedUnderscored}`][allowedValue] = true;
            }
        }
    } 
}

function testExportsWarnings() {
    console.log("TESTING WARNINGS:\n-------------------------------------------------------");
    let isWarning = false;

    for (const r_u of ["ranked", "unranked"]) {
        // avoid infinite games
        // TODO: whenever --maxpausetime gets implemented, remove this
        if (!exports.nopause && !exports[`nopause${r_u}`]) {
            isWarning = true;
            console.log(`    Warning: No --nopause nor --nopause${r_u}, `
                        + `${r_u} games are likely to last forever`); 
        }
    }

    if (isWarning) console.log("[ WARNINGS ! ]\n");
    else console.log("[ SUCCESS ]\n");
}
