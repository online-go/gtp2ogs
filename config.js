// vim: tw=120 softtabstop=4 shiftwidth=4

let fs = require('fs')
let console = require('console');

const allowed_r_u_Families = ["boardsizes","boardsizewidths", "boardsizeheights",
                              "komis", "rules", "challengercolors", "speeds",
                              "timecontrols"];
generateExports_r_u(allowed_r_u_Families);
exports.check_rejectnew = function() {};

exports.updateFromArgv = function() {
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
        .describe('boardsizewidths', 'For custom board sizes, boardsize width(s) to accept')
        .string('boardsizewidths')
        .describe('boardsizeheights', 'For custom board sizes, boardsize height(s) to accept')
        .string('boardsizeheights')
        .describe('boardsizewidthsranked', 'For custom board sizes, boardsize width(s) to accept for ranked games')
        .string('boardsizewidthsranked')
        .describe('boardsizeheightsranked', 'For custom board sizes, boardsize height(s) to accept for ranked games')
        .string('boardsizeheightsranked')
        .describe('boardsizewidthsunranked', 'For custom board sizes, boardsize width(s) to accept for unranked games')
        .string('boardsizewidthsunranked')
        .describe('boardsizeheightsunranked', 'For custom board sizes, boardsize height(s) to accept for unranked games')
        .string('boardsizeheightsunranked')
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

    if (!optimist.argv._ || optimist.argv._.length === 0) {
        optimist.showHelp();
        process.exit();
    }

    // console messages
    // A- greeting and debug status //
    let debugStatusMessage = "OFF";
    if (optimist.argv.debug) {
        debugStatusMessage = "ON\n-Will show detailed debug booting data\n-Will show all console notifications";
    }
    console.log(`\ngtp2ogs version 6.0\n--------------------\n- For changelog or latest devel updates, please visit https://github.com/online-go/gtp2ogs/tree/devel\nDebug status: ${debugStatusMessage}`);
    // B - check deprecated argv //
    testDeprecatedArgv(optimist.argv, "komis");

    /* exports arrays
    /  A) general case:*/
    const genericMain_r_u_Families = ["minmaintimeblitz","minmaintimelive",
    "minmaintimecorr","maxmaintimeblitz", "maxmaintimelive", "maxmaintimecorr", "minperiodsblitz",
    "minperiodslive", "minperiodscorr", "maxperiodsblitz", "maxperiodslive", "maxperiodscorr",
    "minperiodtimeblitz", "minperiodtimelive", "minperiodtimecorr", "maxperiodtimeblitz",
    "maxperiodtimelive", "maxperiodtimecorr", "minhandicap", "maxhandicap", "noautohandicap",
    "proonly", "nopauseonweekends", "nopause"];

    /* B) specific cases:
    /  rank family args need parsing before exporting*/
    const rank_r_u_Families = ["minrank", "maxrank"];
    // bans family is an example of All/ranked/unranked family:
    // export general AND ranked AND unranked args
    const all_r_u_Families = ["bans"];
    // note: allowed_r_u_Families use a different formula before
    //       exporting, included here as well

    // C) combinations of all r_u args, to export separately
    const full_r_u_Families = genericMain_r_u_Families
                              .concat(rank_r_u_Families,
                                      all_r_u_Families,
                                      allowed_r_u_Families);
    const full_r_u_Args = full_r_u_ArgsFromFamilyNameStrings(full_r_u_Families);

    /* EXPORTS FROM OPTIMIST.ARGV */
    /* 0) root exports*/
    for (let k in optimist.argv) {
        if (!full_r_u_Args.includes(k)) {
            /* Add and Modify exports*/
            if (k === "host" && optimist.argv.beta) {
                exports[k] = 'beta.online-go.com';
            } else if (["timeout","startupbuffer"].includes(k)) {
                // Convert some times to microseconds once here so
                // we don't need to do it each time it is used later.
                exports[k] = optimist.argv[k]*1000;
            } else if (k === "apikey") {
                exports[k] = optimist.argv[k];
            } else if (k === "debug") {
                exports.DEBUG = optimist.argv.debug;
                exports[k] = optimist.argv[k]; //TODO: remove either of these
            } else if (k === "_") {
                exports.bot_command = optimist.argv[k];
            } else if (k === "fakerank") {
                exports[k] = parseRank(optimist.argv[k]);
            } else { // ex: "persist", "maxconnectedgames", etc.
                exports[k] = optimist.argv[k];
            }
        }
    }
    exports.check_rejectnew = function()
    {
        if (optimist.argv.rejectnew)  return true;
        if (optimist.argv.rejectnewfile && fs.existsSync(optimist.argv.rejectnewfile))  return true;
        return false;
    };

    // r_u exports
    /* 1) general r_u cases:*/
    for (let familyNameString of genericMain_r_u_Families) {
        const argObject = argObjectRU(optimist.argv, familyNameString);
        for (let r_u in argObject) {
            exports[r_u][familyNameString] = argObject[r_u];
        }
    }

    /* 2) specific r_u cases:*/
    for (let familyNameString of rank_r_u_Families) {
        const argObject = argObjectRU(optimist.argv, familyNameString);
        for (let r_u in argObject) {
            exports[r_u][familyNameString] = parseRank(argObject[r_u]);
        }
    }

    for (let familyNameString of allowed_r_u_Families) {
        const argObject = argObjectRU(optimist.argv, familyNameString);
        for (let r_u in argObject) {
            if (argObject[r_u]) {
                if (argObject[r_u] === "all") {
                    exports[r_u][`allow_all_${familyNameString}`] = true;
                } else if (argObject[r_u] === "custom") {
                    exports[r_u][`allow_custom_${familyNameString}`] = true;
                } else {
                    for (let allowedValue of argObject[r_u].split(',')) { // ex: ["9", "13", "15:17", "19:25:2"]
                        if (familyNameString === "komis" && allowedValue === "automatic") {
                            exports[r_u][`allowed_${familyNameString}`]["null"] = true;
                        } else if (allowedValue.includes(":")) {
                            let [a,b,increment] = allowedValue.split(":").map(e => Number(e));
                            increment = Math.abs(increment) || 1; // default is 1, this also removes allowedValue 0 (infinite loop)
                            let [min, max] = [Math.min(a,b), Math.max(a,b)]; 
                            for (let i = min; i <= max; i = i + increment) {
                                exports[r_u][`allowed_${familyNameString}`][String(i)] = true;
                                if ((Math.abs(max-min)/increment) > 1000) {
                                    throw new `please reduce list length in ${familyNameString}, max is 1000 elements per range.`;
                                }
                            }
                        } else {
                            exports[r_u][`allowed_${familyNameString}`][String(allowedValue)] = true;
                        }
                    }
                }
            }
        }
    }

    for (let bansString of all_r_u_Families) {
        let [general,ranked,unranked] = familyArrayNamesGRU(bansString).map(e => optimist.argv[e]);
        for (let [arg, r_u_arr] of [ [general, ["ranked", "unranked"]], [ranked, ["ranked"]], [unranked, ["unranked"]] ]) {
            if (arg) {
                for (let user of arg.split(',')) {
                    for (let r_u of r_u_arr) {
                        exports[r_u]["banned_users"][String(user)] = true;
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
        let result = { ...exports };
        for (let r_u of ["ranked", "unranked"]) {
            console.log(`${r_u.toUpperCase()} EXPORTS RESULT:\n-------------------------------------------------------\n${JSON.stringify(result[r_u])}\n`);
        }
        result.apikey = "hidden";
        delete result.ranked;
        delete result.unranked;
        console.log(`ROOT EXPORTS RESULT:\n-------------------------------------------------------\n${JSON.stringify(result)}\n`);
    }
}

// before starting:
function generateExports_r_u(allowed_r_u_Families) {
    for (let r_u of ["ranked", "unranked"]) {
        exports[r_u] = { banned_users: {},
                         allow_custom_boardsizes: false };
        for (let familyNameString of allowed_r_u_Families) {
            exports[r_u][`allow_all_${familyNameString}`] = false;
            exports[r_u][`allowed_${familyNameString}`] = {};
        }
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
            const begining = `Deprecated: --${oldName} is no longer supported`;
            if (newName) {
                throw new `${begining}, use --${newName} instead.`;
            } else {
                throw new `${begining}, see all supported options list https://github.com/online-go/gtp2ogs/blob/devel/docs/OPTIONS-LIST.md`;
            }
        }
    }
    for (let komisGRUArg of familyArrayNamesGRU(komisFamilyNameString)) {
        if (optimistArgv[komisGRUArg]) {
            for (let komi of ["auto","null"]) {
                if (optimistArgv[komisGRUArg].split(",").includes(komi)) {
                    throw new `Deprecated: --${komisGRUArg} /${komi}/ is no longer supported, use --${komisGRUArg} /automatic/ instead`;
                }
            }
        }
    }
    console.log("\n");
}

// exports arrays:
function full_r_u_ArgsFromFamilyNameStrings(full_r_u_Families) {
    let finalArray = [];
    for (let familyNameString of full_r_u_Families) {
        familyArrayNamesGRU(familyNameString).forEach(e => finalArray.push(e));
    }
    return finalArray;
}

// optimist.argv.arg(general/ranked/unranked) to exports.(r_u).arg:
function familyArrayNamesGRU(familyNameString) {
    return ["", "ranked", "unranked"].map(e => `${familyNameString}${e}`);
}

function argObjectRU(optimistArgv, familyNameString) {
    const [general,ranked,unranked] = familyArrayNamesGRU(familyNameString).map(e => optimistArgv[e] || undefined);
    if (general !== undefined && ranked === undefined && unranked === undefined) { // a var declared 0 == undefined, but !== undefined
        return { ranked: general, unranked: general };
    } else {
        return { ranked, unranked };
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
            throw new `error: could not parse rank -${arg}-`;
        }
    }
}

function checkExportsWarnings(noPauseString) {
    console.log("CHECKING WARNINGS:\n-------------------------------------------------------");
    let isWarning = false;
    // avoid infinite games
    // TODO: whenever --maxpausetime +ranked + unranked gets implemented, remove this
    for (let r_u of ["ranked","unranked"]) {
        if (!exports[r_u][noPauseString]) {
            isWarning = true;
            console.log(`    Warning: No --${noPauseString} nor --${noPauseString}${r_u}, ${r_u} games are likely to last forever`);
        }

        // warn about potentially problematic timecontrols:
        const pTcs = [["absolute", "(no period time)"], ["none", "(infinite time)"]];
        if (exports[r_u]["allow_all_timecontrols"] === true) {
            isWarning = true;
            console.log(`    Warning: potentially problematic time control for ${r_u} games detected (-${pTcs[0][0]}- ${pTcs[0][1]} and -${pTcs[1][0]}- ${pTcs[1][1]} in -all-): may cause unwanted time management problems with users`);
        }
        for (let [tc, descr] of pTcs) {
            if (exports[r_u]["allowed_timecontrols"][tc] === true) {
                isWarning = true;
                console.log(`    Warning: potentially problematic time control for ${r_u} games detected -${tc}- ${descr}: may cause unwanted time management problems with users`);
            }
        }
    }
    if (isWarning) console.log("[ WARNINGS ! ]\n");
    else console.log("[ SUCCESS ]\n");
}
