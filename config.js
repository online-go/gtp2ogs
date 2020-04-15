// vim: tw=120 softtabstop=4 shiftwidth=4

const fs = require('fs')
const console = require('console');

exports.check_rejectnew = function() {};
const allowed_r_u_Families = ["boardsizes",
                              "komis",
                              "rules",
                              "challengercolors",
                              "speeds",
                              "timecontrols"
                             ];
generateExports_r_u(allowed_r_u_Families);

exports.updateFromArgv = function() {
    const ogsPvAIs = ["LeelaZero", "Sai", "KataGo", "PhoenixGo", "Leela"];

    const optimist = require("optimist")
        // 1) ROOT ARGUMENTS:
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
        .describe('ogspv', `Send winrate and variations for supported AIs (${ogsPvAIs.join(', ')})with supported settings, in OGS games`)
        .string('ogspv')
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
        .describe('privateonly', 'Only accept private matches')
        .describe('publiconly', 'Only accept public (non-private) matches')
        .describe('fakerank', 'Fake bot ranking to calculate automatic handicap stones number in autohandicap (-1) based on rankDifference between fakerank and user ranking, to fix the bypass minhandicap maxhandicap issue if handicap is -automatic')
        // 2) ARGUMENTS TO CHECK RANKED/UNRANKED CHALLENGES:
        //     A) ALL/RANKED/UNRANKED FAMILIES:
        .describe('bans', 'Comma separated list of usernames or IDs')
        .string('bans')
        .describe('bansranked', 'Comma separated list of usernames or IDs who are banned from ranked games')
        .string('bansranked')
        .describe('bansunranked', 'Comma separated list of usernames or IDs who are banned from unranked games')
        .string('bansunranked')
        //     B) GENERAL/RANKED/UNRANKED FAMILIES:
        //         B1) ALLOWED FAMILIES:
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
        .describe('rules', 'Rule(s) to accept')
        .default('rules', 'chinese')
        .describe('rulesranked', 'Rule(s) to accept for ranked games')
        .describe('rulesunranked', 'Rule(s) to accept for unranked games')
        .describe('challengercolors', 'Challenger color(s) to accept')
        .default('challengercolors', 'all')
        .describe('challengercolorsranked', 'Challenger color(s) to accept for ranked games')
        .describe('challengercolorsunranked', 'Challenger color(s) to accept for unranked games')
        .describe('speeds', 'Game speed(s) to accept')
        .default('speeds', 'all')
        .describe('speedsranked', 'Game speed(s) to accept for ranked games')
        .describe('speedsunranked', 'Game speed(s) to accept for unranked games')
        .describe('timecontrols', 'Time control(s) to accept')
        .default('timecontrols', 'fischer,byoyomi,simple,canadian')
        .describe('timecontrolsranked', 'Time control(s) to accept for ranked games')
        .describe('timecontrolsunranked', 'Time control(s) to accept for unranked games')
        //         B2) GENERIC GENERAL/RANKED/UNRANKED ARGUMENTS:
        .describe('proonly', 'For all matches, only accept those from professionals')
        .describe('proonlyranked', 'For ranked matches, only accept those from professionals')
        .describe('proonlyunranked', 'For unranked matches, only accept those from professionals')
        /* note: - nopause allows to disable pauses DURING games, (game.js), but
        /        - nopauseonweekends rejects challenges BEFORE games (connection.js)
        /          (only for correspondence games)*/
        .describe('nopause', 'Do not allow pauses during games')
        .describe('nopauseranked', 'Do not allow pauses during ranked games')
        .describe('nopauseunranked', 'Do not allow pauses during unranked games')
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
    // B - check unsupported argv //
    testDeprecatedArgv(argv);
    checkUnsupportedOgspvAI(argv.ogspv, ogsPvAIs);
    checkNotYetReleasedArgv(argv);

    /* EXPORTS FROM argv */
    /* 0) root exports*/
    for (const k in argv) {
        // export everything first, then modify/adjust later
        exports[k] = argv[k];
    }

    /* Add and Modify exports*/
    if (argv.debug) {
        exports.DEBUG = true;
    }
    if (argv.ogspv) {
        exports.ogspv = argv.ogspv.toUpperCase();
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
    exports.bot_command = argv._;
    exports.check_rejectnew = function()
    {
        if (argv.rejectnew)  return true;
        if (argv.rejectnewfile && fs.existsSync(argv.rejectnewfile))  return true;
        return false;
    };

    // r_u exports
    /* 2) specific r_u cases:*/
    for (const familyNameString of ["minrank", "maxrank"]) {
        for (const argNameString of getArgNameStringsGRU(familyNameString)) {
            if (argv[argNameString]) {
                exports[argNameString] = parseRank(argv[argNameString]);
            }
        }
    }

    for (const familyNameString of ["boardsizes", "komis"]) {
        for (const [argNameString, descr] of get_r_u_arr_allowed(familyNameString)) {
            if (argv[argNameString]) {
                for (const arg of argv[argNameString].split(',')) {
                    if (arg === "all") {
                        exports[`allow_all_${familyNameString}${descr}`] = true;
                    } else if (familyNameString === "komis" && arg === "automatic") {
                        exports[`allowed_${familyNameString}${descr}`][null] = true;
                    } else if (arg.includes(":")) {
                        const [numberA, numberB, incr] = arg.split(":").map( n => Number(n) );
                        const [min, max] = [Math.min(numberA, numberB), Math.max(numberA, numberB)];
                        const increment = Math.abs(incr) || 1; // default is 1, this also removes arg number 0 (infinite loop)
                        // if too much incrementations, sanity check
                        const threshold = 1000;
                        if ( (Math.abs(max - min) / increment) > threshold) {
                            throw new `please reduce list length in ${argNameString}, max is ${threshold} elements per range.`;
                        }
                        for (let i = min; i <= max; i = i + increment) {
                            exports[`allowed_${familyNameString}${descr}`][String(i)] = true;
                        }
                    } else {
                        exports[`allowed_${familyNameString}${descr}`][arg] = true;
                    }
                }
            }
        }
    }

    for (const familyNameString of ("rules", "challengercolors", "speeds", "timecontrols")) {
        for (const [argNameString, descr] of get_r_u_arr_allowed(familyNameString)) {
            for (const e of argv[argNameString].split(',')) {
                if (e === "all") {
                    exports[`allow_all_${familyNameString}${descr}`] = true;
                } else {
                    exports[`allowed_${familyNameString}${descr}`][e] = true;
                }
            }
        }
    }

    for (const [argNameString, descr] of get_r_u_arr_allowed("bans")) {
        if (argv[argNameString]) {
            for (const user of argv[argNameString].split(',')) {
                exports[`banned_users${descr}`][user] = true;
            }
        }
    }

    // console messages
    // C - check exports warnings:
    checkExportsWarnings("nopause");

    // Show in debug all the ranked/unranked exports results
    if (exports.DEBUG) {
        const result = JSON.stringify({ ...exports, apikey: "hidden"});
        console.log(`${"r_u".toUpperCase()} EXPORTS RESULT (apikey hidden):`
                    + `\n-------------------------------------------------------`
                    + `\n${result}\n`);
    }
}

// before starting:
function generateExports_r_u(allowed_r_u_Families) {
    for (const r_u of ["", "_ranked", "_unranked"]) {
        exports[`banned_users${r_u}`] = {};

        for (const familyNameString of allowed_r_u_Families) {
            exports[`allow_all_${familyNameString}${r_u}`] = false;
            exports[`allowed_${familyNameString}${r_u}`] = {};
        }
    }
}

// console messages:
function testDeprecatedArgv(argv) {
    const deprecatedArgv = [
         [["botid", "bot", "id"], "username"],
         [["minrankedhandicap"], "minhandicapranked"],
         [["minunrankedhandicap"], "minhandicapunranked"],
         [["maxrankedhandicap"], "maxhandicapranked"],
         [["maxunrankedhandicap"], "maxhandicapunranked"],
         [["maxtotalgames"], "maxconnectedgames"],
         [["maxactivegames"], "maxconnectedgamesperuser"],
         [["maxmaintime"],  "maxmaintimeblitz, --maxmaintimelive and/or --maxmaintimecorr"],
         [["maxmaintimeranked"], "maxmaintimeblitzranked, --maxmaintimeliveranked and/or --maxmaintimecorrranked"],
         [["maxmaintimeunranked"], "maxmaintimeblitzunranked, --maxmaintimeliveunranked and/or --maxmaintimecorrunranked"],
         [["minmaintime"], "minmaintimeblitz, --minmaintimelive and/or --minmaintimecorr"],
         [["minmaintimeranked"], "minmaintimeblitzranked, --minmaintimeliveranked and/or --minmaintimecorrranked"],
         [["minmaintimeunranked"], "minmaintimeblitzunranked, --minmaintimeliveunranked and/or --minmaintimecorrunranked"],
         [["maxperiodtime"], "maxperiodtimeblitz, --maxperiodtimelive and/or --maxperiodtimecorr"],
         [["maxperiodtimeranked"], "maxperiodtimeblitzranked, --maxperiodtimeliveranked and/or --maxperiodtimecorrranked"],
         [["maxperiodtimeunranked"], "maxperiodtimeblitzunranked, --maxperiodtimeliveunranked and/or --maxperiodtimecorrunranked"],
         [["minperiodtime"], "minperiodtimeblitz, --minperiodtimelive and/or --minperiodtimecorr"],
         [["minperiodtimeranked"], "minperiodtimeblitzranked, --minperiodtimeliveranked and/or --minperiodtimecorrranked"],
         [["minperiodtimeunranked"], "minperiodtimeblitzunranked, --minperiodtimeliveunranked and/or --minperiodtimecorrunranked"],
         [["maxperiods"],  "maxperiodsblitz, --maxperiodslive and/or --maxperiodscorr"],
         [["maxperiodsranked"], "maxperiodsblitzranked, --maxperiodsliveranked and/or --maxperiodscorrranked"],
         [["maxperiodsunranked"], "maxperiodsblitzunranked, --maxperiodsliveunranked and/or --maxperiodscorrunranked"],
         [["minperiods"], "minperiodsblitz, --minperiodslive and/or --minperiodscorr"],
         [["minperiodsranked"], "minperiodsblitzranked, --minperiodsliveranked and/or --minperiodscorrranked"],
         [["minperiodsunranked"], "minperiodsblitzunranked, --minperiodsliveunranked and/or --minperiodscorrunranked"],
         [["ban"], "bans"],
         [["banranked"], "bansranked"],
         [["banunranked"], "bansunranked"],
         [["boardsize"], "boardsizes"],
         [["boardsizeranked"], "boardsizesranked"],
         [["boardsizeunranked"], "boardsizesunranked"],
         [["boardsizeswidth", "boardsizeswidthranked", "boardsizeswidthunranked", "boardsizesheight", 
           "boardsizesheightranked", "boardsizesheightunranked"], "boardsizes"],
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
    for (const [oldNames, newName] of deprecatedArgv) {
        for (const oldName of oldNames) {
            if (argv[oldName]) {
                console.log(`Deprecated: --${oldName} is no longer `
                            + `supported, use --${newName} instead.`);
            }
        }
    }
    for (const argNameString of getArgNameStringsGRU("komis")) {
        if (argv[argNameString]) {
            for (const komi of ["auto","null"]) {
                if (argv[argNameString].split(",").includes(komi)) {
                    console.log(`Deprecated: --${argNameString} ${komi} is no longer `
                                + `supported, use --${argNameString} automatic instead`);
                }
            }
        }
    }
    console.log("\n");
}

function checkUnsupportedOgspvAI(argvOgsPv, ogsPvAIs) {
    const ogsPv = argvOgsPv.toUpperCase();  // being case sensitive tolerant
    const upperCaseAIs = ogsPvAIs.map(e => e.toUpperCase());

    if (!upperCaseAIs.includes(ogsPv)) {
        throw `Unsupported --ogspv option ${ogsPv}.`
              + `\nSupported options are ${ogsPvAIs.join(', ')}`;
    }
}

function checkNotYetReleasedArgv(argv) {
    const notYetArgs = ["publiconly", "privateonly"];
    for (const arg of notYetArgs) {
        if (argv[arg]) {
            throw `--${arg} has been added recently to the gtp2ogs code `
                  + `but is not yet ready to use. You can check if this `
                  + `option is available in the next updates.`;
        }
    }

    for (const rulesArg of getArgNameStringsGRU("rules")) {
        if (argv[rulesArg] && argv[rulesArg] !== "chinese") {
            throw `OGS server currently does not support other rules than chinese, `
                  + `please use --${rulesArg} chinese or disalbe this option.`;
        }
    }
}

// argv.arg(general/ranked/unranked) to exports.(r_u).arg:
function getArgNameStringsGRU(familyNameString) {
    return ["", "ranked", "unranked"].map( e => `${familyNameString}${e}` );
}

function get_r_u_arr_allowed(familyNameString) {
    return [ [familyNameString, ""],
             [`${familyNameString}ranked`, "_ranked"],
             [`${familyNameString}unranked`, "_unranked"]
           ];
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

function checkExportsWarnings(noPauseString) {
    console.log("CHECKING WARNINGS:\n-------------------------------------------------------");
    let isWarning = false;

    for (const r_u of ["ranked", "unranked"]) {
        // avoid infinite games
        // TODO: whenever --maxpausetime gets implemented, remove this
        if (!exports[noPauseString] && !exports[`${noPauseString}${r_u}`]) {
            isWarning = true;
            console.log(`    Warning: No --${noPauseString} nor --${noPauseString}${r_u}, `
                        + `${r_u} games are likely to last forever`); 
        }
    }

    // warn about potentially problematic timecontrols:
    for (const [argNameString, descr] of get_r_u_arr_allowed("timecontrols")) {
        for (const [timeControl, detail] of [ ["absolute", "(no period time)"],
                                              ["none", "(infinite time)"] ]) {
            if (exports[`allowed_timecontrols${descr}`][timeControl] === true ||
                exports[`allow_all_timecontrols${descr}`] === true) {
                isWarning = true;
                console.log(`    Warning: potentially problematic --${argNameString} `
                            + `detected (${timeControl} ${detail}): may cause unwanted `
                            + `time management problems with users`);
            }
        }
    }

    if (isWarning) console.log("[ WARNINGS ! ]\n");
    else console.log("[ SUCCESS ]\n");
}
