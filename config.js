// vim: tw=120 softtabstop=4 shiftwidth=4

let fs = require('fs')
let console = require('console');

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
        .describe('insecure', "Don't use ssl to connect to the ggs/rest servers")
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
    if (!optimist.argv._ || optimist.argv._.length === 0) {
        optimist.showHelp();
        process.exit();
    }

    // console messages
    // A- greeting and debug status //
    let debugStatusMessage = "-\n-Skipping debug booting data\n-Shrinking all console notifications";
    if (optimist.argv.debug) {
        debugStatusMessage = "ON\n-Will show detailed debug booting data\n-Will show all console notifications\n\nk IN OPTIMIST.ARGV[k] TO EXPORTS[k] RESULT:\n-------------------------------------------------------";
        exports.DEBUG = optimist.argv.debug; // if --debug, export an alias "DEBUG" instead
    }
    console.log(`\nYou are using gtp2ogs version 6.0\n- For changelog or latest devel updates, please visit https://github.com/online-go/gtp2ogs/tree/devel\nDebug status: ${debugStatusMessage}\n`);
    console.log(`    case alias: DEBUG + ${exports.DEBUG}`);

    // Set the exports from optimist.argv[k]
    for (let k in optimist.argv) {
        if (k === "host" && optimist.argv.beta) {
            exports.host = 'beta.online-go.com';
            debugLogExports(`    case modified: host + ${exports["host"]}`);
        } else if (k === "timeout" || k === "startupbuffer") {
            // Convert some times to microseconds once here so we don't need to do it each time it is used later.
            exports[k] = optimist.argv[k] * 1000;
            debugLogExports(`    case modified: ${k} + ${exports[k]}`);
        } else if (k !== "debug" && k !== "fakerank") { // standard case, excluded special cases
            /* note: don't filter families we need both the arg and the allowed_family export
            /  ex: config.boardsizesranked AND config.allowed_boardsizes_ranked[19]
            /  same for all the general/ranked/unranked familes (minrank, etc.), so we put them here too */
            exports[k] = optimist.argv[k];
            if (k === "apikey") {
                debugLogExports(`    case hidden: ${k} + hidden}`);
            } else {
                debugLogExports(`    result: ${k} + ${exports[k]}`);
            }
        }
    }
    debugLogExports("\n");

    // special exports (argDebugLog is included) :
    parseMinmaxrankFamilyNameString("minrank");
    parseMinmaxrankFamilyNameString("maxrank");
    if (exports.fakerank) {
        /* - the parsing functions needs optimist.argv to be exported first,
        /    do not put the fakerank exports here
        /  - remove fakerank when the bypass automatic handicap issue is fixed, 
        /    and/or when server adds an automatic handicap new object*/
        parseMinmaxRankFromNameString("fakerank");
    }
    // from here on, not using optimist.argv anymore, we can work directly on exports
    exportBoardsizeIfExports("boardsizes");
    exportKomiIfExports("komis");
    exportIfExports(["speeds", "timecontrols"]);

    exports.check_rejectnew = function()
    {
        if (exports.rejectnew)  return true;
        if (exports.rejectnewfile && fs.existsSync(exports.rejectnewfile))  return true;
        return false;
    }
    if (exports.check_rejectnew) {
        debugLogExports(`    case function: exports.check_rejectnew + DONE`);
    }
    exports.bot_command = exports._;
    if (exports.bot_command) {
        debugLogExports(`    case alias: bot_command + ${exports["bot_command"]}\n`);
    }

    // console messages
    // B- exports full checks in debug //
    const allRankedUnrankedFamilies = ["bans"];
    const rankedUnrankedFamilies = ["boardsizes", "boardsizewidths", "boardsizeheights", "komis",
        "speeds", "timecontrols", "minhandicap", "maxhandicap", "minmaintimeblitz","minmaintimelive",
        "minmaintimecorr","maxmaintimeblitz", "maxmaintimelive", "maxmaintimecorr", "minperiodsblitz",
        "minperiodslive", "minperiodscorr", "maxperiodsblitz", "maxperiodslive", "maxperiodscorr",
        "minperiodtimeblitz", "minperiodtimelive", "minperiodtimecorr", "maxperiodtimeblitz",
        "maxperiodtimelive", "maxperiodtimecorr", "minrank", "maxrank", "noautohandicap", "nopause"];
    if (exports.DEBUG) {
        checkExports(allRankedUnrankedFamilies, rankedUnrankedFamilies);
    }

    // C - check deprecated features //
    testDeprecated("komis");

    // D - check Warnings :
    checkWarnings(rankedUnrankedFamilies, "nopause");
    // end of console messages
}

function familyArrayFromGeneralExportString(generalExportsString) {
    return ["", "ranked", "unranked"].map(e => generalExportsString + e);
}

function extraRankedUnrankedString(exportsNameString) {
    if (exportsNameString.includes("unranked")) {
        return "_unranked";
    } else if (exportsNameString.includes("ranked")) {
        return "_ranked";
    } else {
        return "";
    }
}

function pluralExportsNameStringToPluralFamilyString(plural) {
    return plural.split("unranked")[0].split("ranked")[0];
}

function allowedExportsString(exportsNameString, extraRankedUnranked) {
    return "allowed_" + pluralExportsNameStringToPluralFamilyString(exportsNameString) + extraRankedUnranked;
}

function parseMinmaxRankFromNameString(rankExportsNameString) {
    if (exports[rankExportsNameString]) {
        const re = /(\d+)([kdp])/;
        const results = exports[rankExportsNameString].toLowerCase().match(re);

        if (results) {
            if (results[2] === "k") {
                exports[rankExportsNameString] = 30 - parseInt(results[1]);
                debugLogExports(`    case family: ${rankExportsNameString} / ${results} + ${exports[rankExportsNameString]}`);
            } else if (results[2] === "d") {
                exports[rankExportsNameString] = 30 - 1 + parseInt(results[1]);
                debugLogExports(`    case family: ${rankExportsNameString} / ${results} + ${exports[rankExportsNameString]}`);
            } else if (results[2] === "p") {
                exports[rankExportsNameString] = 36 + parseInt(results[1]);
                debugLogExports(`    case family: ${rankExportsNameString} / ${results} + ${exports[rankExportsNameString]}`);
                if (rankExportsNameString.includes("minrank")) {
                    exports.proonly = true;
                    debugLogExports(exports.proonly, `    case family: proonly (${rankExportsNameString} > 36) + ${exports.proonly}`);
                }
            }
        } else {
            console.error(`Invalid ${rankExportsNameString} ${exports[rankExportsNameString]}`);
            process.exit();
        }
    }
}

function parseMinmaxrankFamilyNameString(familyNameString) {
    const familyArray = familyArrayFromGeneralExportString(familyNameString);
    for (let arg of familyArray) {
        parseMinmaxRankFromNameString(arg);
    }
}

function exportBoardsizeIfExports(familyNameString) {
    let extraRankedUnranked = "";
    for (let exportsNameString of familyArrayFromGeneralExportString(familyNameString)) {
        if (exports[exportsNameString]) {
            extraRankedUnranked = extraRankedUnrankedString(exportsNameString);
            for (let boardsize of exports[exportsNameString].split(',')) {
                if (boardsize === "all") {
                    exports["allow_all_boardsizes" + extraRankedUnranked] = true;
                    debugLogExports(`    case family: ${"allow_all_boardsizes" + extraRankedUnranked} + ${exports["allow_all_boardsizes" + extraRankedUnranked]}`);
                } else if (boardsize === "custom") {
                    exports["allow_custom_boardsizes" + extraRankedUnranked] = true;
                    debugLogExports(`    case family: ${"allow_custom_boardsizes" + extraRankedUnranked} + ${exports["allow_custom_boardsizes" + extraRankedUnranked]}`);
                    for (let width of exports["boardsizewidths" + extraRankedUnranked].split(',')) {
                        exports["allowed_custom_boardsizewidths" + extraRankedUnranked][width] = true;
                        debugLogExports(`    case family: ${"allowed_custom_boardsizewidths" + extraRankedUnranked}  / ${width} + ${exports["allowed_custom_boardsizewidths" + extraRankedUnranked][width]}`);
                    }
                    for (let height of exports["boardsizeheights" + extraRankedUnranked].split(',')) {
                        exports["allowed_custom_boardsizeheights" + extraRankedUnranked][height] = true;
                        debugLogExports(`    case family: ${"allowed_custom_boardsizeheights" + extraRankedUnranked}  / ${height} + ${exports["allowed_custom_boardsizeheights" + extraRankedUnranked][height]}`);
                    }
                } else {
                    exports[allowedExportsString(exportsNameString, extraRankedUnranked)][boardsize] = true;
                    debugLogExports(`    case family: ${allowedExportsString(exportsNameString, extraRankedUnranked)} / ${boardsize} + ${exports[allowedExportsString(exportsNameString, extraRankedUnranked)][boardsize]}`);
                }
            }
        }
    }
}

function exportKomiIfExports(familyNameString) {
    let extraRankedUnranked = "";
    for (let exportsNameString of familyArrayFromGeneralExportString(familyNameString)) {
        if (exports[exportsNameString]) {
            extraRankedUnranked = extraRankedUnrankedString(exportsNameString);
            for (let komi of exports[exportsNameString].split(',')) {
                if (komi === "all") {
                    exports["allow_all_komis" + extraRankedUnranked] = true;
                    debugLogExports(`    case family: ${"allow_all_komis" + extraRankedUnranked} + ${exports["allow_all_komis" + extraRankedUnranked]}`);
                } else if (komi === "automatic") {
                    exports["allowed_komis" + extraRankedUnranked][null] = true;
                    debugLogExports(`    case family: ${"allowed_komis" + extraRankedUnranked} / null + ${exports["allowed_komis" + extraRankedUnranked][null]}`);
                } else {
                    exports[allowedExportsString(exportsNameString, extraRankedUnranked)][komi] = true;
                    debugLogExports(`    case family: ${allowedExportsString(exportsNameString, extraRankedUnranked)} / ${komi} + ${exports[allowedExportsString(exportsNameString, extraRankedUnranked)][komi]}`);
                }
            }
        }
    }
}

function exportIfExports(familyNameStringsArray) {
    let extraRankedUnranked = "";
    for (let familyNameString of familyNameStringsArray) {
        for (let exportsNameString of familyArrayFromGeneralExportString(familyNameString)) {
            if (exports[exportsNameString]) {
                extraRankedUnranked = extraRankedUnrankedString(exportsNameString);
                for (let e of exports[exportsNameString].split(',')) {
                    exports[allowedExportsString(exportsNameString, extraRankedUnranked)][e] = true;
                    debugLogExports(`    case family: ${allowedExportsString(exportsNameString, extraRankedUnranked)} / ${e} + ${exports[allowedExportsString(exportsNameString, extraRankedUnranked)][e]}`);
                }
            }
        }
    }
}

// console messages functions:
function debugLogExports(messageString) {
    if (exports.DEBUG) {
        console.log(messageString);
    }
}

function checkExports(allRankedUnrankedFamilies, rankedUnrankedFamilies) {
    console.log("SHOW EXPORTS RANKED/UNRANKED GAMES SELECTION:\n-------------------------------------------------------");
    let familyArray = [];
    let rankedExportValue = "";
    let unrankedExportValue = "";
    // all / ranked / unranked exports :
    for (let familyNameString of allRankedUnrankedFamilies) {
        familyArray = familyArrayFromGeneralExportString(familyNameString);
        console.log(`    ${familyArray[0].toUpperCase()}(*): -all: ${exports[familyArray[0]] || "-"}, -ranked: ${exports[familyArray[1]] || "-"}, -unranked: ${exports[familyArray[2]] || "-"}`);
    }
    // ranked / unranked exports :
    for (let familyNameString of rankedUnrankedFamilies) {
        familyArray = familyArrayFromGeneralExportString(familyNameString);
        // for example ["komis", "komisranked", "komisunranked"];
        if (exports[familyArray[0]] && !exports[familyArray[1]] && !exports[familyArray[2]]) {
            rankedExportValue = exports[familyArray[0]];
            unrankedExportValue = exports[familyArray[0]];
        } else {
            rankedExportValue = exports[familyArray[1]] || "-";
            unrankedExportValue = exports[familyArray[2]] || "-";
        }
        console.log(`    ${familyArray[0].toUpperCase()}: -ranked: ${rankedExportValue}, -unranked: ${unrankedExportValue}`);
    }
    console.log("\n");
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

function checkWarnings(rankedUnrankedFamilies, noPauseFamilyString) {
    console.log("CHECK WARNINGS:\n-------------------------------------------------------");
    let familyArray = [];
    let isWarning = false;
    // if exports[1], need exports[2], and vice versa
    for (let familyNameString of rankedUnrankedFamilies) {
        familyArray = familyArrayFromGeneralExportString(familyNameString);
        if (exports[familyArray[1]] && !exports[familyArray[2]]) {
            isWarning = true;
            console.log(`    Warning: --${familyArray[1]} detected but --${familyArray[2]} is missing, no value for unranked games !`);
        }
        if (exports[familyArray[2]] && !exports[familyArray[1]]) {
            isWarning = true;
            console.log(`    Warning: --${familyArray[2]} detected but --${familyArray[1]} is missing, no value for ranked games !`);
        }
    }
    /* avoid infinite games
    /  TODO : whenever --maxpausetime +ranked + unranked gets implemented, remove this */
    familyArray = familyArrayFromGeneralExportString(noPauseFamilyString);
    if (!exports[familyArray[0]] && !exports[familyArray[1]] && !exports[familyArray[2]]) {
        isWarning = true;
        console.log(`    Warning: No --${familyArray[0]}, --${familyArray[1]}, nor --${familyArray[2]}, games are likely to last forever`); 
    }
    if (isWarning) {
        console.log("[ ERRORS ! ]\n");
    } else {
        console.log("[ SUCCESS ]\n");
    }
}

