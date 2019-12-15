// vim: tw=120 softtabstop=4 shiftwidth=4

let querystring = require('querystring');

let io = require('socket.io-client');
let http = require('http');
let https = require('https');
let sprintf = require('sprintf-js').sprintf;

let console = require('./console').console;
let config = require('./config');
let Game = require('./game').Game;

/****************/
/** Connection **/
/****************/
let ignorable_notifications = {
    'gameStarted': true,
    'gameEnded': true,
    'gameDeclined': true,
    'gameResumedFromStoneRemoval': true,
    'tournamentStarted': true,
    'tournamentEnded': true,
};

class Connection {
    constructor(io_client) {{{
        let prefix = (config.insecure ? 'http://' : 'https://') + config.host + ':' + config.port;

        conn_log(`Connecting to ${prefix}`);
        if (!io_client) {
          io_client = io;
        }
        let socket = this.socket = io_client(prefix, {
            reconection: true,
            reconnectionDelay: 500,
            reconnectionDelayMax: 60000,
            transports: ['websocket'],
        });

        this.connected_games = {};
        this.games_by_player = {};  // Keep track of connected games per player
        this.connected = false;

        this.connect_timeout = setTimeout(()=>{
            if (!this.connected) {
                console.error(`Failed to connect to ${prefix}`);
                process.exit(-1);
            }
        }, (/online-go.com$/.test(config.host)) ? 5000 : 500);

        if (config.timeout) {
            this.idle_timeout_interval = setInterval(
                this.disconnectIdleGames.bind(this), 10000);
        }

        if (config.DEBUG) {
            setInterval(this.dumpStatus.bind(this), 15*60*1000);
        }

        this.clock_drift = 0;
        this.network_latency = 0;
        this.ping_interval = setInterval(this.ping.bind(this), 10000);
        socket.on('net/pong', this.handlePong.bind(this));

        socket.on('connect', () => {
            this.connected = true;
            conn_log("Connected");
            this.ping();

            socket.emit('bot/id', {'id': config.username}, (obj) => {
                this.bot_id = obj.id;
                this.jwt = obj.jwt;
                if (!this.bot_id) {
                    console.error("ERROR: Bot account is unknown to the system: " +   config.username);
                    process.exit();
                }
                conn_log("Bot is username: " + config.username);
                conn_log("Bot is user id:", this.bot_id);
                socket.emit('authenticate', this.auth({}))
                socket.emit('notification/connect', this.auth({}), (x) => {
                    conn_log(x);
                })
                socket.emit('bot/connect', this.auth({ }));
                socket.emit('bot/hidden', !!config.hidden);
            });
        });

        if (config.corrqueue) {
            // Check every so often if we have correspondence games that need moves
            this.corr_queue_interval = setInterval(() => {
                // If a game needs a move and we aren't already working on one, make a move
                if (Game.corr_moves_processing === 0) {
                    /* Choose a corr game to make a move
                    /  TODO: Choose the game with least time remaining*/
                    let candidates = [];
                    for (let game_id in this.connected_games) {
                        if (this.connected_games[game_id].corr_move_pending) {
                            candidates.push(this.connected_games[game_id]);
                        }
                    }
                    // Pick a random game that needs a move.
                    if (candidates.length > 0) {
                        let game = candidates[Math.floor(Math.random()*candidates.length)];
                        game.makeMove(game.state.moves.length);
                    }
                }
            }, 1000);
        }

        this.notification_connect_interval = setInterval(() => {
            /* if we're sitting there bored, make sure we don't have any move
            / notifications that got lost in the shuffle... and maybe someday
            /  we'll get it figured out how this happens in the first place. */
            if (Game.moves_processing === 0) {
                socket.emit('notification/connect', this.auth({}), (x) => {
                    conn_log(x);
                })
            }
        }, 10000);
        socket.on('event', (data) => {
            this.verbose(data);
        });
        socket.on('disconnect', () => {
            this.connected = false;

            conn_log("Disconnected from server");

            for (let game_id in this.connected_games) {
                this.disconnectFromGame(game_id);
            }
        });

        socket.on('notification', (notification) => {
            if (this['on_' + notification.type]) {
                this['on_' + notification.type](notification);
            }
            else if (!(notification.type in ignorable_notifications)) {
                console.log("Unhandled notification type: ", notification.type, notification);
                this.deleteNotification(notification);
            }
        });

        socket.on('active_game', (gamedata) => {
            if (config.DEBUG) conn_log("active_game:", JSON.stringify(gamedata));

            /* OGS auto scores bot games now, no removal processing is needed by the bot.
            
            /  Eventually might want OGS to not auto score, or make it bot-optional to enforce.
            /  Some bots can handle stone removal process.
            
            /  if (gamedata.phase === 'stone removal'
            /   && ((!gamedata.black.accepted && gamedata.black.id === this.bot_id)
            /   ||  (!gamedata.white.accepted && gamedata.white.id === this.bot_id))
            /   ) {
            /   this.processMove(gamedata);
            /   }*/

            if (gamedata.phase === "finished") {
                if (gamedata.id in this.connected_games) {
                    /* When a game ends, we don't get a "finished" active_game.phase. Probably since the game is no
                    /  longer active.(Update: We do get finished active_game events? Unclear why I added prior note.)
                    /  Note: active_game and gamedata events can arrive in either order.*/

                    if (config.DEBUG) conn_log(gamedata.id, "active_game phase === finished");

                    /* XXX We want to disconnect right away here, but there's a game over race condition
                    /      on server side: sometimes /gamedata event with game outcome is sent after
                    /      active_game, so it's lost since there's no game to handle it anymore...
                    /      Work around it with a timeout for now.*/
                    if (!this.connected_games[gamedata.id].disconnect_timeout) {
                        if (config.DEBUG) console.log("Starting disconnect Timeout in Connection active_game for " + gamedata.id);
                        this.connected_games[gamedata.id].disconnect_timeout =
                            setTimeout(() => {  this.disconnectFromGame(gamedata.id);  }, 1000);
                    }
                }
                // Don't connect to finished games.
                return;
            }

            // Don't connect if it is not our turn.
            if (gamedata.player_to_move !== this.bot_id)
                return;

            // Set up the game so it can listen for events.
            this.connectToGame(gamedata.id);
        });
    }}}
    auth(obj) { /* {{{ */
        obj.apikey = config.apikey;
        obj.bot_id = this.bot_id;
        obj.player_id = this.bot_id;
        if (this.jwt) {
            obj.jwt = this.jwt;
        }
        return obj;
    } /* }}} */
    connectToGame(game_id) { /* {{{ */
        if (game_id in this.connected_games) {
            if (config.DEBUG) conn_log("Connected to game", game_id, "already");
            return this.connected_games[game_id];
        }

        return this.connected_games[game_id] = new Game(this, game_id);
    } /* }}} */
    disconnectFromGame(game_id) { /* {{{ */
        if (config.DEBUG) {
            conn_log("disconnectFromGame", game_id);
        }
        if (game_id in this.connected_games) {
            this.connected_games[game_id].disconnect();
            delete this.connected_games[game_id];
        }
    } /* }}} */
    disconnectIdleGames() {
        if (config.DEBUG) conn_log("Looking for idle games to disconnect");
        let now = Date.now();
        for (let game_id in this.connected_games) {
            let state = this.connected_games[game_id].state;
            if (state === null) {
                if (config.DEBUG) conn_log("No game state, not checking idle status for", game_id);
                continue;
            }
            let idle_time = now - state.clock.last_move;
            if ((state.clock.current_player !== this.bot_id) && (idle_time > config.timeout)) {
                if (config.DEBUG) conn_log("Found idle game", game_id, ", other player has been idling for", idle_time, ">", config.timeout);
                this.disconnectFromGame(game_id);
            }
        }
    }
    dumpStatus() {
        for (let game_id in this.connected_games) {
            let game = this.connected_games[game_id];
            let msg = [];
            msg.push('game_id=' + game_id + ':');
            if (game.state === null) {
                msg.push('no_state');
                conn_log(...msg);
                continue;
            }
            msg.push('black=' + game.state.players.black.username);
            msg.push('white=' + game.state.players.white.username);
            if (game.state.clock.current_player === this.bot_id) {
                msg.push('bot_turn');
            }
            let idle_time = (Date.now() - game.state.clock.last_move) / 1000;
            msg.push('idle_time=' + idle_time + 's');
            if (game.bot === null) {
                msg.push('no_bot');
                conn_log(...msg);
                continue;
            }
            msg.push('bot.proc.pid=' + game.bot.pid());
            msg.push('bot.dead=' + game.bot.dead);
            msg.push('bot.failed=' + game.bot.failed);
            conn_log(...msg);
        }
    }
    deleteNotification(notification) { /* {{{ */
        this.socket.emit('notification/delete', this.auth({notification_id: notification.id}), () => {
            conn_log("Deleted notification ", notification.id);
        });
    } /* }}} */
    connection_reset() { /* {{{ */
        for (let game_id in this.connected_games) {
            this.disconnectFromGame(game_id);
        }
        if (this.socket) this.socket.emit('notification/connect', this.auth({}), (x) => {
            conn_log(x);
        });
    } /* }}} */
    on_friendRequest(notification) { /* {{{ */
        console.log("Friend request from ", notification.user.username);
        post(api1("me/friends/invitations"), this.auth({ 'from_user': notification.user.id }))
        .then((obj)=> conn_log(obj.body))
        .catch(conn_log);


    } /* }}} */
    // Check challenge pre-requirements are acceptable, else no need to check challenge settings
    //
    checkChallengePreRequirements(notification) { /* {{{ */

        // check user is acceptable first, else don't mislead user :
        const resultBans = bannedFamilyReject("bans", notification.user.id, notification.user.username);
        if (resultBans) {
            return resultBans;
        }
        if (config.proonly && !notification.user.professional) {
            conn_log(notification.user.username + " is not a professional");
            return { reject: true, msg: "You are not a professional player, this bot accepts games vs professionals only. " };
        }
        const resultRank = minmaxHandicapRankActualReject("rank", notification.user.ranking, notification.handicap, notification.ranked);
        if (resultRank) {
            return (resultRank);
        }

        // check bot is available, else don't mislead user :
        if (config.check_rejectnew()) {
            conn_log("Not accepting new games (rejectnew).");
            return { reject: true, msg: config.rejectnewmsg };
        }
        if (this.connected_games) {
            const number_connected_games = Object.keys(this.connected_games).length;
            if (config.DEBUG) {
                console.log(`# of connected games = ${number_connected_games}`);
            }
            if (number_connected_games >= config.maxconnectedgames) {
                conn_log(`${number_connected_games} games being played, maximum is ${config.maxconnectedgames}`);
                return { reject: true, msg: `Currently, ${number_connected_games} games are being played by this bot, maximum is ${config.maxconnectedgames} (if you see this message and you dont see any game on the bot profile page, it is because private game(s) are being played), try again later` };
            }
        } else {
            if (config.DEBUG) {
                console.log("There are no connected games");
            }
        }
        const connected_games_per_user = this.gamesForPlayer(notification.user.id);
        if (connected_games_per_user >= config.maxconnectedgamesperuser) {
            conn_log("Too many connected games for this user.");
            return { reject: true, msg: "Maximum number of simultaneous games allowed per player against this bot is " + config.maxconnectedgamesperuser + " , please reduce your number of connected games against this bot, and try again" };
        }

        // check ranked/unranked setting is not forbidden
        if (config.rankedonly && !notification.ranked) {
            conn_log("Ranked games only");
            return { reject: true, msg: "This bot accepts ranked games only. " };
        }
        if (config.unrankedonly && notification.ranked) {
            conn_log("Unranked games only");
            return { reject: true, msg: "This bot accepts Unranked games only. " };
        }

        // Sanity check, user can't choose rules. Bots only play chinese.
        if (["chinese"].indexOf(notification.rules) < 0) {
            conn_log("Unhandled rules: " + notification.rules + ", rejecting challenge");
            return { reject: true, msg: "The " + notification.rules + " rules are not allowed for this bot, please choose allowed rules such as chinese rules. " };
        }

        return { reject: false }; // OK !

    } /* }}} */
    // Check challenge settings are acceptable
    //
    checkChallengeSettings(notification) { /* {{{ */

        /* for all the allowed_family options below 
        /  (boardsizes, komis, timecontrols, speeds) we need to add a "family guard" 
        /  && config.familyranked for ranked games && config.familyunranked for unranked games,
        /  else the allowed_ is always false and always rejects
        /  note : the exception to that rule is the banned_ family :
        /  for banned_ , it is possible to use --bans and/or --bansranked and/or
        /  --bansunranked all at the same time if bot admin wants*/

        const resultBoardsizes = boardsizesFamilyReject("boardsizes", "boardsizewidths", "boardsizeheights", notification.width, notification.height, notification.ranked, "board size", "board size width", "board size height");
        if (resultBoardsizes) {
            return resultBoardsizes;
        }

        if (notification.handicap === -1) {
            const noAutoHandicapResult = noAutohandicapReject("noautohandicap", notification.handicap, notification.ranked, "-automatic- handicap");
            if (noAutoHandicapResult) {
                return noAutoHandicapResult;
            }
            if (config.fakerank) {
                /* below is a fix of automatic handicap bypass issue
                /  by manually calculating handicap stones number
                /  then calculate if it is within min/max limits set by botadmin

                /  TODO : remove all the fakerank below when server gives us support for
                /  "automatic handicap" notification object, containing both the type of 
                /  handicap "automatic"/"user-defined" as well as the number of stones in each case*/
                let fakeRankDifference = Math.abs(Math.trunc(notification.user.ranking) - config.fakerank);
                /* adding a truncate because a 5.9k (6k) vs 6.0k (7k) is 0.1 rank difference,
                /  but it is in fact a still a 6k vs 7k = Math.abs(6-7) = 1 rank difference game*/
                const resultFakeHandicap = minmaxHandicapRankActualReject("handicap", fakeRankDifference, notification.handicap, notification.ranked);
                if (resultFakeHandicap) {
                    return (resultFakeHandicap);
                }
            }
        }

        const resultHandicap = minmaxHandicapRankActualReject("handicap", notification.handicap, notification.handicap, notification.ranked);
        if (resultHandicap) {
            return (resultHandicap);
        }
        const resultKomis = komisFamilyReject("komis", notification.komi, notification.ranked, "komi");
        if (resultKomis) {
            return resultKomis;
        }
        const simpleAllowedFamiliesArray = [["speeds", notification.time_control.speed, notification.ranked, "speed"],
                                            ["timecontrols", notification.time_control.time_control, notification.ranked, "time control"]];
        const resultSimpleAllowedFamilies = simpleAllowedFamiliesReject(simpleAllowedFamiliesArray);
        if (resultSimpleAllowedFamilies) {
            return resultSimpleAllowedFamilies;
        }

        const resultMaintime = UHMAEAT("maintime", notification.time_control, notification.ranked);
        if (resultMaintime) {
            return (resultMaintime);
        }
        const resultPeriods = minmaxPeriodsActualReject("periods", notification.time_control.periods, notification.time_control.speed, notification.ranked);
        if (resultPeriods) {
            return (resultPeriods);
        }
        const resultPeriodtime = UHMAEAT("periodtime", notification.time_control, notification.ranked);
        if (resultPeriodtime) {
            return (resultPeriodtime);
        }

        return { reject: false };  // Ok !

    } /* }}} */
    // Check challenge entirely, and return reject status + optional error msg.
    //
    checkChallenge(notification) { /* {{{ */

        const c1 = this.checkChallengePreRequirements(notification);
        if (c1.reject)  return c1;

        const c2 = this.checkChallengeSettings(notification);
        if (c2.reject)  return c2;

        return { reject: false };  /* All good. */

    } /* }}} */
    on_challenge(notification) { /* {{{ */
        const c0 = this.checkChallenge(notification);
        const rejectmsg = (c0.msg ? c0.msg : "");

        const handi = (notification.handicap > 0 ? "H" + notification.handicap : "");
        const accepting = (c0.reject ? "Rejecting" : "Accepting");
        conn_log(sprintf("%s challenge from %s (%s)  [%ix%i] %s id = %i",
                         accepting, notification.user.username, rankToString(notification.user.ranking),
                         notification.width, notification.width,
                         handi, notification.game_id));

        if (!c0.reject) {
            post(api1('me/challenges/' + notification.challenge_id+'/accept'), this.auth({ }))
            .then(ignore)
            .catch(() => {
                conn_log("Error accepting challenge, declining it");
                post(api1('me/challenges/' + notification.challenge_id), this.auth({ 
                    'delete': true,
                    'message': 'Error accepting game challenge, challenge has been removed.',
                }))
                .then(ignore)
                .catch(conn_log)
                this.deleteNotification(notification);
            })
        } else {
            post(api1('me/challenges/' + notification.challenge_id), this.auth({
                'delete': true,
                'message': rejectmsg || "The AI you've challenged has rejected this game.",
            }))
            .then(ignore)
            .catch(conn_log)
        }
    } /* }}} */
    processMove(gamedata) { /* {{{ */
        let game = this.connectToGame(gamedata.id)
        game.makeMove(gamedata.move_number);
    } /* }}} */
    processStoneRemoval(gamedata) { /* {{{ */
        return this.processMove(gamedata);
    } /* }}} */
    on_delete() { /* {{{ */
        /* don't care about delete notifications */
    } /* }}} */
    on_gameStarted() { /* {{{ */
        /* don't care about gameStarted notifications */
    } /* }}} */
    addGameForPlayer(game_id, player) { /* {{{ */
        if (!this.games_by_player[player]) {
            this.games_by_player[player] = [ game_id ];
            return;
        }
        if (this.games_by_player[player].indexOf(game_id) !== -1)  // Already have it ?
            return;
        this.games_by_player[player].push(game_id);
    } /* }}} */
    removeGameForPlayer(game_id) { /* {{{ */
        for (let player in this.games_by_player) {
            let idx = this.games_by_player[player].indexOf(game_id);
            if (idx === -1)  continue;

            this.games_by_player[player].splice(idx, 1);  // Remove element
            if (this.games_by_player[player].length === 0)
                delete this.games_by_player[player];
            return;
        }
    } /* }}} */
    gamesForPlayer(player) { /* {{{ */
        if (!this.games_by_player[player])  return 0;
        return this.games_by_player[player].length;
    } /* }}} */
    ok (str) {{{
        conn_log(str); 
    }}}
    err (str) {{{
        conn_log("ERROR: ", str); 
    }}}
    ping() {{{
        this.socket.emit('net/ping', {client: (new Date()).getTime()});
    }}}
    handlePong(data) {{{
        let now = Date.now();
        let latency = now - data.client;
        let drift = ((now-latency/2) - data.server);
        this.network_latency = latency;
        this.clock_drift = drift;
    }}}
    terminate() {{{
        clearTimeout(this.connect_timeout);
        clearInterval(this.ping_interval);
        clearInterval(this.notification_connect_interval);
        clearInterval(this.corr_queue_interval);
    }}}
}

function bannedFamilyReject(familyNameString, notificationUserId, notificationUserUsername) { /* }}} */
    let bannedUsersString = "";
    for (let argNameString of familyArrayFromFamilyNameString(familyNameString)) { // we check all args for "bans" family
        bannedUsersString = `banned_users${extraRankedUnrankedString(argNameString)}`; // ex: "banned_users_ranked"
        if ( (config[bannedUsersString][notificationUserUsername]) || (config[bannedUsersString][notificationUserId]) ) {
            rankedUnranked = beforeRankedUnrankedGamesSpecial("from ", "", argNameString, "all "); // ex : "from ranked games"
            conn_log(`Username ${notificationUserUsername}, user id ${notificationUserId}, is banned ${rankedUnranked}`);
            return { reject: true, msg: `Username ${notificationUserUsername}, user id ${notificationUserId}, is banned ${rankedUnranked} on this bot by bot admin, you may try changing the ranked/unranked setting` };
        }
    }
}  /* }}} */

function boardsizesFamilyReject(familyNameString, familyNameStringW, familyNameStringH, notificationWidth, notificationHeight, notificationRanked, familyDescription, familyDescriptionW, familyDescriptionH) { /* }}} */
    const argObject = checkBoardsizesFamilyNameStringToArgObjectWH(familyNameString, familyNameStringW, familyNameStringH, notificationWidth, notificationRanked, familyDescription, familyDescriptionW, familyDescriptionH);
    console.log(JSON.stringify(argObject));
    console.log(argObject.allowedBannedObject.allowAllArg);
    if (!config[argObject.allowedBannedObject.allowAllArg]) {
        console.log(argObject.allowedBannedObject.allowCustomArg);
        if (!config[argObject.allowedBannedObject.allowCustomArg]) { // square
            if (notificationWidth !== notificationHeight) {
                const rankedUnranked = beforeRankedUnrankedGamesSpecial("for ", "", argObject.argNameString, "");
                conn_log(`${familyDescription} ${notificationWidth} x ${notificationHeight} is not square, not allowed ${rankedUnranked}`);
                return { reject: true, msg: `Your selected ${familyDescription} ${notificationWidth} x ${notificationHeight} is not square, not allowed ${rankedUnranked} on this bot, please choose a SQUARE ${familyDescription} (same width and height), for example try 9x9 or 19x19}` };
            }
            console.log(argObject.allowedBannedObject.allowedArg);
            if (!config[argObject.allowedBannedObject.allowedArg][notificationWidth]) {
                const argValueConverted = boardsizeSquareToDisplayString(config[argObject.argNameString]);
                const notificationConverted = boardsizeSquareToDisplayString(notificationWidth);
                return allowedFamiliesGenericReject(argValueConverted, notificationConverted, familyDescription);
            }
        } else { // custom : width + height
            for (let argObjectArgWH of [argObject.argW, argObject.argH]) {
                console.log(allowedBannedSettingExtraRankedUnranked(`allowed_custom_${argObjectArgWH.family}`, argObjectArgWH.argNameString));
                if (!(config[allowedBannedSettingExtraRankedUnranked(`allowed_custom_${argObjectArgWH.family}`, argObjectArgWH.argNameString)][argObjectArgWH.notif])) {
                    const rankedUnranked = beforeRankedUnrankedGamesSpecial("for ", "", argObjectArgWH.argNameString, "");
                    conn_log(`${argObjectArgWH.descr} ${rankedUnranked} -${argObjectArgWH.notif}-, not in -${config[argObjectArgWH.argNameString]}- `);
                    return { reject: true, msg: `In your selected board size ${notificationWidth} x ${notificationHeight} (width x height), ${argObjectArgWH.descr} (${argObjectArgWH.notif}) is not allowed ${rankedUnranked} on this bot.\n Please choose one of these allowed CUSTOM values: ${config[argObjectArgWH.argNameString]}` };
                }
            }
        }
    }
} /* }}} */

function komisFamilyReject(familyNameString, familyNotification, notificationRanked, familyDescription) { /* }}} */
    const argObject = checkFamilyNameStringToArgObjectIsArg(familyNameString, notificationRanked);
    if (!config[argObject.allowedBannedObject.allowAllArg]) {
        if (!config[argObject.allowedBannedObject.allowedArg][familyNotification]) {
            let notificationConverted = familyNotification;
            if (notificationConverted === null) {
                notificationConverted = "automatic";
            }
            return allowedFamiliesGenericReject(config[argObject.argNameString], notificationConverted, familyDescription);
        }
    }
} /* }}} */

//["speeds", notification.time_control.speed, notification.ranked, "speed"
function simpleAllowedFamiliesReject(basicAllowedFamiliesArray) { /* }}} */
    let argObject = {};
    for (let [fam, notif, ranked, descr] of basicAllowedFamiliesArray) {
        argObject = checkFamilyNameStringToArgObjectIsArg(fam, ranked);
        // ex: argObject {argNameString: "speedsranked", isArg: true} if --speedsranked correspondence
        if (!config[argObject.allowedBannedObject.allowedArg][notif]) {
            // ex: config["allowed_speeds_ranked"]["correspondence"]
            return allowedFamiliesGenericReject(config[argObject.argNameString], notif, descr);
            /*                             ex: (config["speedsranked"], correspondence, "speed") */
        }
    }
} /* }}} */

function noAutohandicapReject(argNameString, notificationHandicap, notificationRanked, familyDescription) { /* }}} */
    const noAutoHandicapObject = checkFamilyNameStringToArgObjectIsArg(argNameString, notificationRanked);
    const rankedUnranked = beforeRankedUnrankedGamesSpecial("for ", "", argNameString, "");
    if (config[noAutoHandicapObject.isArg]) {
        conn_log(`no ${familyDescription} ${rankedUnranked}`);
        return { reject: true, msg: `For easier bot management, ${familyDescription} is disabled on this bot ${rankedUnranked}, please manually select the number of handicap stones you want in -custom- handicap, for example 2 handicap stones, you may also try changing the ranked/unranked setting` };
    }
}  /* }}} */

// minmax families reject functions :
function minmaxPeriodsActualReject(familyNameString, familyNotification, notificationTSpeed, notificationRanked) { /* }}} */
    /* "fischer", "simple", "absolute", "none", don't have a periods number,
    /  so this function only applies to "byoyomi" and "canadian"*/
    for (let blitzLiveCorr of ["blitz", "live", "corr"]) {
        if (notificationTSpeed === convertBlitzLiveCorr(blitzLiveCorr)) {
            const minArgObject = argObjectMIBLIsminmax("min" + familyNameString + blitzLiveCorr, notificationRanked);
            const maxArgObject = argObjectMIBLIsminmax("max" + familyNameString + blitzLiveCorr, notificationRanked);
            /* example : {argNameString: "minperiodsblitzranked"},
                                   MIBL: {minMax: mm, incDec: ir, belAbo: ba, lowHig: lh},
                                   isMM: {isMin: true, isMax: false,
                                  isArg: true};*/
            for (let argObject of [minArgObject, maxArgObject]) {
                if (minmaxCondition(config[argObject.argNameString], familyNotification, argObject.isMM.isMin)) { // if we dont reject, we early exit all the remaining reject
                    const rankedUnranked = beforeRankedUnrankedGamesSpecial("for ", notificationTSpeed + " ", argObject.argNameString, "");
                    conn_log(`${familyNotification} is ${argObject.MIBL.belAbo} ${argObject.MIBL.minMax} ${familyNameString} ${rankedUnranked} ${config[argObject.argNameString]}`);
                    return { reject: true, msg: `${argObject.MIBL.minMax} ${familyNameString} ${rankedUnranked} ${config[argObject.argNameString]}, please ${argObject.MIBL.incDec} the number of ${familyNameString}.` };
                }
            }
        }
    }
}

function minmaxHandicapRankActualReject(familyNameString, familyNotification, notificationHandicap, notificationRanked) {
    const minArgObject = argObjectMIBLIsminmax("min" + familyNameString, notificationRanked);
    const maxArgObject = argObjectMIBLIsminmax("max" + familyNameString, notificationRanked);
    for (let argObject of [minArgObject, maxArgObject]) {
        /* for handicap and rank families, default general arg is not always provided,
        / need to check isArg to avoid config.arg undefined error*/
        if (argObject.isArg && minmaxCondition(config[argObject.argNameString], familyNotification, argObject.isMM.isMin)) { // add an if arg check, because we dont provide defaults for all arg families
            let argNumberConverted = config[argObject.argNameString];
            let familyNameStringConverted = familyNameString;
            let familyNotificationConverted = familyNotification;
            let rankedUnranked = beforeRankedUnrankedGamesSpecial("for ", "", argObject.argNameString, "");
            let endingSentence = "";
            if (familyNameString === "handicap") {
                familyNameStringConverted = "handicap stones";
                endingSentence = `please ${argObject.MIBL.incDec} the number of ${familyNameStringConverted}`;
                // handicap specific rejects below :
                if (argObject.isMM.isMin && familyNotificationConverted === 0 && argNumberConverted > 0) {
                    rankedUnranked = beforeRankedUnrankedGamesSpecial("", "even ", argObject.argNameString, "");
                    conn_log(`No ${rankedUnranked} (handicap games only)`);
                    return { reject: true, msg: `This bot does not play ${rankedUnranked}, please manually select the number of ${familyNameStringConverted} in -custom handicap- : minimum is ${argNumberConverted} ${familyNameStringConverted}, or try changing ranked/unranked game setting.` };
                } else if (argObject.isMM.isMax && familyNotificationConverted > 0 && argNumberConverted === 0) {
                    rankedUnranked = beforeRankedUnrankedGamesSpecial("", "handicap ", argObject.argNameString, "");
                    conn_log(`No ${rankedUnranked} (even games only)'`);
                    return { reject: true, msg: `This bot does not play ${rankedUnranked}, please choose handicap -none- (0 handicap stones), or try changing ranked/unranked game setting.` };
                } else if (notificationHandicap === -1 && config.fakerank) { // fakerank specific reject
                    conn_log(`Automatic handicap ${rankedUnranked} was set to ${familyNotificationConverted} stones, but ${argObject.MIBL.minMax} handicap ${rankedUnranked} is ${argNumberConverted} stones`);
                    return { reject: true, msg: `Your automatic handicap ${rankedUnranked} was automatically set to ${familyNotificationConverted} stones based on rank difference between you and this bot,\nBut ${argObject.MIBL.minMax} handicap ${rankedUnranked} is ${argNumberConverted} stones \nPlease ${argObject.MIBL.incDec} the number of handicap stones in -custom handicap- instead of -automatic handicap-` };
                }
            } else if (familyNameString === "rank") {
                argNumberConverted = rankToString(argNumberConverted);
                familyNotificationConverted = rankToString(familyNotificationConverted);
                endingSentence = `your rank is too ${argObject.MIBL.lowHig}`;
            }
            // if we are not in any "handicap" specific reject case, we return the generic return below instead :
            conn_log(`${familyNotificationConverted} is ${argObject.MIBL.belAbo} ${argObject.MIBL.minMax} ${familyNameStringConverted} ${rankedUnranked} ${argNumberConverted}`);
            return { reject: true, msg: `${argObject.MIBL.minMax} ${familyNameStringConverted} ${rankedUnranked} is ${argNumberConverted}, ${endingSentence}.` };
        }
    }
// end of minmax families reject functions
} /* }}} */

function UHMAEAT(mainPeriodTime, notificationT, notificationRanked) { /* }}} */
    /*// UHMAEAT : Universal Highly Modulable And Expandable Argv Tree *** (version 4.0) ///////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    / 1) "none" doesnt have a period time, so we let it slide from both maintime and periodtime rejects
    / 2) "simple" doesn't have a main time, only a period time, so we let it slide from maintime rejects
    / 3) "absolute" doesn't have a period time, so we let it slide from periodtime rejects
    / 4) for fischer maintimes, it is much easier to check initial time and max time separately
    / 5) notificationT.time_control possible values: "fischer" , "byoyomi" , "canadian", "simple", "absolute", "none"
    / 6) notificationT.speed possible values: "blitz", "live", "correspondence"
    / 7) - for canadian periodtimes, notificationT.period_time is already for X stones,
    /    so no need to multiply it by notificationT.stones_per_period
    /    - But when we process config[argObject.argNameString], bot admin inputs periodtime in arg
    /    as if it could be "byoyomi" or "simple" or any other standard periodtime (for 1 stone), 
    /    so we need to multiply config[argObject.argNameString] by the number of stones per period
    /    e.g. 30 seconds average period time for 1 stone = 30*20 = 600 = 10 minutes period time for all the 20 stones.*/

    for (let blitzLiveCorr of ["blitz", "live", "corr"]) {
        if (notificationT.speed === convertBlitzLiveCorr(blitzLiveCorr)) {
            const minArgObject = argObjectMIBLIsminmax("min" + mainPeriodTime + blitzLiveCorr, notificationRanked);
            const maxArgObject = argObjectMIBLIsminmax("max" + mainPeriodTime + blitzLiveCorr, notificationRanked);
            const timecontrolsSettings = timecontrolsMainPeriodTime(mainPeriodTime, notificationT);
            let argNumberConverted = -1;
            for (let argObject of [minArgObject, maxArgObject]) {
                for (let setting of timecontrolsSettings) {
                    if (notificationT.time_control === setting[0]) {
                        argNumberConverted = config[argObject.argNameString];
                        if (setting[0] === "canadian" && mainPeriodTime === "periodtime") {
                            argNumberConverted = argNumberConverted * notificationT.stones_per_period;
                        }
                        if (minmaxCondition(argNumberConverted, setting[2], argObject.isMM.isMin)) { // if we dont reject, we early exit all the remaining reject
                            const argNumberConverted = timespanToDisplayString(argNumberConverted); // ex: "1 minutes"
                            const rankedUnranked = beforeRankedUnrankedGamesSpecial("for ", notificationT.speed + " ", argObject.argNameString, "");
                            let endingSentence = "";
                            if ((notificationT.time_control === "canadian") && (mainPeriodTime === "periodtime")) {
                                endingSentence = ", or change the number of stones per period";
                            }
                            conn_log(`${timespanToDisplayString(setting[2])} is ${argObject.MIBL.belAbo} ${argObject.MIBL.minMax} ${setting[1]} ${rankedUnranked} in ${notificationT.time_control} ${argNumberConverted}`);
                            return { reject : true, msg: `${argObject.MIBL.minMax} ${setting[1]} ${rankedUnranked} in ${notificationT.time_control} is ${argNumberConverted}, please ${argObject.MIBL.incDec} ${setting[1]}${endingSentence}.` };
                            /* example : "Minimum (Main/Period) Time for blitz ranked games
                             * in byoyomi is 1 minutes, please increase (Main/Period) Time."*/
                        }
                    }
                }
            }
        }
    }
}

function timecontrolsMainPeriodTime(mpt, notificationT) {
    if (mpt === "maintime") {
        return [["fischer", "Initial Time", notificationT.initial_time],
                ["fischer", "Max Time", notificationT.max_time],
                ["byoyomi", "Main Time", notificationT.main_time],
                ["canadian", "Main Time", notificationT.main_time],
                ["absolute", "Total Time", notificationT.total_time]];
    } else {
        return [["fischer", "Increment Time", notificationT.time_increment],
                ["byoyomi", "Period Time", notificationT.period_time],
                ["canadian", "Period Time for all the " + notificationT.stones_per_period + " stones", notificationT.period_time],
                ["simple", "Time per move", notificationT.per_move]];
    }
}  /* }}} */

function rankToString(r) { /* {{{ */
    const R = Math.floor(r);
    if (R >= 30)  return (R-30+1) + 'd'; // R>=30 : 1 dan or stronger
    else          return (30-R) + 'k';   // R<30  : 1 kyu or weaker
} /* }}} */

function timespanToDisplayString(timespan) { /* {{{ */
    let ss = timespan % 60;
    let mm = Math.floor(timespan / 60 % 60);
    let hh = Math.floor(timespan / (60*60) % 24);
    let dd = Math.floor(timespan / (60*60*24));
    let text = ["days", "hours", "minutes", "seconds"];
    return [dd, hh, mm, ss]
    .map((e, i) => e === 0 ? "" : `${e} ${text[i]}`)
    .filter(e => e !== "")
    .join(" ");
} /* }}} */

function boardsizeSquareToDisplayString(boardsizeSquare) { /* {{{ */
    return boardsizeSquare
    .toString()
    .split(',')
    .map(e => e.trim())
    .map(e => `${e}x${e}`)
    .join(', ');
} /* }}} */

function beforeRankedUnrankedGamesSpecial(before, extra, argNameString, special) { /* {{{ */
    const isExtra = (extra !== "");
    if (argNameString.includes("unranked")) {
        return `${before}${extra}unranked games`; //ex: "for blitz unranked games"
    } else if (argNameString.includes("ranked")) {
        return `${before}${extra}ranked games`;   //ex: "for ranked games"
    } else if (isExtra) {
        return `${before}${extra}games`           //ex: "for correspondence games"
    } else if (special !== "") {
        return `${before}${special}games`         //ex: "from all games"
    } else {
        return "";
    }
} /* }}} */

function familyArrayFromFamilyNameString(familyNameString) { /* {{{ */
    return ["", "ranked", "unranked"].map(e => familyNameString + e);
} /* }}} */

function extraRankedUnrankedArgNameString(argNameString) { /* {{{ */
    if (argNameString.includes("unranked")) {
        return `${argNameString}_unranked`; // ex: "boardsizes_unranked"
    } else if (argNameString.includes("ranked")) {
        return `${argNameString}_ranked`;
    } else {
        return argNameString;
    }
} /* }}} */

function extraRankedUnrankedString(argNameString) { /* {{{ */
    if (argNameString.includes("unranked")) {
        return "_unranked";
    } else if (argNameString.includes("ranked")) {
        return "_ranked";
    } else {
        return "";
    }
} /* }}} */

function checkFamilyNameStringToArgNameString(familyNameString, notificationRanked) { /* {{{ */
    const familyArray = familyArrayFromFamilyNameString(familyNameString);
    if (config[familyArray[2]] && !notificationRanked) {
        return familyArray[2];
    } else if (config[familyArray[1]] && notificationRanked) {
        return familyArray[1];
    } else if (config[familyArray[0]]) {
        return [familyArray[0];
    } else {
        return false;
    }
} /* }}} */


function argObjectMIBLIsminmax(familyNameString, notificationRanked) { /* {{{ */
    const argNameString = checkFamilyNameStringToArgNameString(familyNameString, notificationRanked);
    if (argNameString) {
        let mm = "";
        let ir = "";
        let ba = "";
        let lh = "";
        const isMin = familyNameString.includes("min");
        const isMax = familyNameString.includes("max");
        if (isMin) {
            mm = "Minimum";
            ir = "increase";
            ba = "below";
            lh = "low";
        } else {
            mm = "Maximum";
            ir = "reduce";
            ba = "above";
            lh = "high";
        }
        return {argNameString,
                         MIBL: {minMax: mm, incDec: ir, belAbo: ba, lowHig: lh},
                         isMM: {isMin, isMax},
                        isArg: true};
    } else {
        return false;
    }
} /* }}} */

function argObjectAllowed(familyNameString, notificationRanked) { /* {{{ */
    const argNameString = checkFamilyNameStringToArgNameString(familyNameString, notificationRanked); // ex: "boardsizesranked"
    if (argNameString) {
        const extraArgNameString = extraRankedUnrankedArgNameString(argNameString); // ex: "boardsizes_ranked"
        return {argNameString,
                    allowAll : `allow_all_${extraArgNameString}`, // ex: "allow_all_boardsizes_ranked"
                 allowCustom : `allow_custom_${extraArgNameString}`,
                     allowed : `allowed_${extraArgNameString}`};
    } else {
        return false;
    }
} /* }}} */

function minmaxCondition(argNumber, familyNotification, isMin) { /* {{{ */
    if (isMin) {
        return familyNotification < argNumber; // to reject in minimum, we need notification < arg
    } else {
        return familyNotification > argNumber;
    }
} /* }}} */

function convertBlitzLiveCorr(blitzLiveCorr) { /* {{{ */
    if (blitzLiveCorr === "corr") {
        return "correspondence";
    } else {
        return blitzLiveCorr;
    }
} /* }}} */

function conn_log() { /* {{{ */
    let arr = ["# "];
    let errlog = false;
    for (let i=0; i < arguments.length; ++i) {
        let param = arguments[i];
        if (typeof(param) === 'object' && 'error' in param) {
            errlog = true;
            arr.push(param.error);
        } else {
            arr.push(param);
        }
    }

    if (errlog) {
        console.error.apply(null, arr);
        console.error(new Error().stack);
    } else {
        console.log.apply(null, arr);
    }
} /* }}} */

function ignore() {}
function api1(str) { return "/api/v1/" + str; }
function post(path, data, cb, eb) { return request("POST", config.host, config.port, path, data, cb, eb); }
function request(method, host, port, path, data) { /* {{{ */
    return new Promise((resolve, reject) => {
        if (config.DEBUG) {
            /* Modern NodeJS offers shallow copy syntax:
            /  let noapidata = { ...data, apikey: "hidden"};
            
            / Make a deep copy just in case.*/
            let noapidata = JSON.parse(JSON.stringify(data));
            noapidata.apikey = "hidden";

            console.debug(method, host, port, path, noapidata);
        }

        let enc_data_type = "application/x-www-form-urlencoded";
        for (let k in data) {
            if (typeof(data[k]) === "object") {
                enc_data_type = "application/json";
            }
        }

        let headers = null;
        if (data._headers) {
            data = JSON.parse(JSON.stringify(data));
            headers = data._headers;
            delete data._headers;
        }

        let enc_data = null;
        if (enc_data_type === "application/json") {
            enc_data = JSON.stringify(data);
        } else {
            enc_data = querystring.stringify(data);
        }

        let options = {
            host: host,
            port: port,
            path: path,
            method: method,
            headers: {
                'Content-Type': enc_data_type,
                'Content-Length': enc_data.length
            }
        };
        if (headers) {
            for (let k in headers) {
                options.headers[k] = headers[k];
            }
        }

        let req = (config.insecure ? http : https).request(options, (res) => {
            res.setEncoding('utf8');
            let body = "";
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode > 299) {
                    reject({'error': `${res.statusCode} - ${body}`, 'response': res, 'body': body})
                    return;
                }
                resolve({'response': res, 'body': body});
            });
        });
        req.on('error', (e) => {
            reject({'error': e.message})
        });

        req.write(enc_data);
        req.end();
    });
} /* }}} */

exports.Connection = Connection;
