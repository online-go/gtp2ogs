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
    checkChallengePreRequirements(notification, r_u_s) { /* {{{ */

        // check user is acceptable first, else don't mislead user :
        for (let uid of ["username", "id"]) {
            if (config[r_u_s.r_u].banned_users[notification.user[uid]]) {
                conn_log(`${uid} ${notification.user[uid]} is banned ${r_u_s.for_r_u_games}`);
                return { reject: true, msg: `${uid} ${notification.user[uid]} is banned ${r_u_s.for_r_u_games} on this bot by bot admin, you may try changing the ranked/unranked setting` };
            }
        }
        const resultRank = genericMinMaxReject("rank", "rank", notification.user.ranking, false, false, r_u_s);
        if (resultRank) {
            return (resultRank);
        }
        if (config[r_u_s.r_u].proonly && !notification.user.professional) {
            conn_log(notification.user.username + " is not a professional");
            return { reject: true, msg: "You are not a professional player, this bot accepts games vs professionals only." };
        }

        // check bot is available, else don't mislead user :
        if (config[r_u_s.r_u].check_rejectnew()) {
            conn_log(`Not accepting new games (rejectnew) ${r_u_s.for_r_u_games}.`);
            return { reject: true, msg: config[r_u_s.r_u].rejectnewmsg };
        }
        if (this.connected_games) {
            const number_connected_games = Object.keys(this.connected_games).length;
            if (config.DEBUG) {
                console.log(`# of connected games = ${number_connected_games}`);
            }
            if (number_connected_games >= config[r_u_s.r_u].maxconnectedgames) {
                conn_log(`${number_connected_games} games being played, maximum is ${config[r_u_s.r_u].maxconnectedgames} ${r_u_s.for_r_u_games}`);
                return { reject: true, msg: `Currently, ${number_connected_games} games are being played by this bot, maximum is ${config[r_u_s.r_u].maxconnectedgames} ${r_u_s.for_r_u_games} (if you see this message and you dont see any game on the bot profile page, it is because private game(s) are being played and not visible), try again later` };
            }
        } else {
            if (config.DEBUG) {
                console.log(`There are no connected games ${r_u_s.for_r_u_games}`);
            }
        }
        const connected_games_per_user = this.gamesForPlayer(notification.user.id);
        if (connected_games_per_user >= config[r_u_s.r_u].maxconnectedgamesperuser) {
            conn_log(`Too many connected games for this user ${r_u_s.for_r_u_games}.`);
            return { reject: true, msg: `Maximum number of simultaneous games allowed per player against this bot ${r_u_s.for_r_u_games} is ${config[r_u_s.r_u].maxconnectedgamesperuser}, please reduce your number of simultaneous games against this bot, and try again` };
        }

        // check ranked/unranked setting is not forbidden
        if (config[r_u_s.r_u].rankedonly && !notification.ranked) {
            conn_log("Ranked games only");
            return { reject: true, msg: "This bot accepts ranked games only." };
        }
        if (config[r_u_s.r_u].unrankedonly && notification.ranked) {
            conn_log("Unranked games only");
            return { reject: true, msg: "This bot accepts Unranked games only." };
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
    checkChallengeSettings(notification, r_u_s) { /* {{{ */

        if (notification.handicap === -1) {
            if (config[r_u_s.r_u].noautohandicap) {
                return booleanReject("noautohandicap", "-automatic- handicap", r_u_s);
            }
            /***** fakerank : automatic handicap min/max handicap limits detection ******/
            if (config[r_u_s.r_u].fakerank) {
                /* below is a fix of automatic handicap bypass issue
                /  by manually calculating handicap stones number,
                /  then compare this number of stones with the rank difference
                /  between user and the bot (since server doesn't provide
                /  bot ranking data, we are using a fake bot ranking "fakerank"

                /  TODO : 2 possibilities :
                       A) replace fakerank with bot ranking provided by server
                          whenever server implements this
                       B) delete all the fakerank code whenever the automatic
                          handicap bypass minmaxhandicap bug is fixed
                          (ex: if server sends handicap {"automatic", "5"} instead of -1)*/
                const fakeRankDifference = Math.abs(Math.trunc(notification.user.ranking) - Math.trunc(config[r_u_s.r_u].fakerank));
                /* adding a truncate because a 5.9k (6k) vs 6.1k (7k) is 0.2 rank difference,
                /  but it is in fact a still a 6k vs 7k = Math.abs(6-7) = 1 rank difference game

                /  first, if ranked game, we eliminate > 9 automatic handicap stones*/
                if (notification.ranked && (fakeRankDifference > 9)) {
                    conn_log(`Rank difference > 9 in a ranked game would be 10+ handicap stones, not allowed ${r_u_s.for_r_u_games}`);
                    return {reject: true, msg: `A rank difference between you and this bot of ${fakeRankDifference} would be 10 or more automatic handicap stones, not allowed ${r_u_s.for_r_u_games}`};
                }
                /* then, we consider value of minmax handicap (if set)
                /  and compare it with fakeRankDifference */
                const resultFakeHandicap = genericMinMaxReject("handicap", "handicap stones", fakeRankDifference, notification.handicap, false, r_u_s);
                if (resultFakeHandicap) {
                    return (resultFakeHandicap);
                }
            }
        }
        const resultHandicap = genericMinMaxReject("handicap", "handicap stones", notification.handicap, notification.handicap, false, r_u_s);
        if (resultHandicap) {
            return (resultHandicap);
        }

        // non generic boardsizes rejects first
        let extraConditionBoardsizes = false;
        if (!config[r_u_s.r_u].allow_all_boardsizes) {
            if (!config[r_u_s.r_u].allow_custom_boardsizes) {
                extraConditionBoardsizes = true;
                // A) if not square
                if (notification.width !== notification.height) {
                    conn_log(`board size ${notification.width} x ${notification.height} is not square, not allowed ${r_u_s.for_r_u_games}`);
                    return { reject: true, msg: `Your selected board size ${notification.width} x ${notification.height} is not square, not allowed ${r_u_s.for_r_u_games} on this bot, please choose a SQUARE board size (same width and height)` };
                }
                // B) (if square, will reject later with the generic allowed_ families reject)
            // 2) for custom board sizes, including square board sizes if width === height as well :
            } else {
                // A) if custom, check width
                if (!config[r_u_s.r_u].allowed_custom_boardsizewidths[notification.width]) {
                    return customBoardsizeWidthsHeightsReject("boardsizewidths", "board size WIDTH" , notification.width, notification.height, r_u_s);
                }
                // B) if custom, check height
                if (!config[r_u_s.r_u].allowed_custom_boardsizeheights[notification.height]) {
                    return customBoardsizeWidthsHeightsReject("boardsizeheights", "board size HEIGHT", notification.width, notification.height, r_u_s);
                }
            }
         }

        const testsAllowedFamilies = [["boardsizes", "board size", notification.width, extraConditionBoardsizes],
                                      ["komis", "komi", notification.komi, true],
                                      ["speeds", "speed", notification.time_control.speed, true],
                                      ["timecontrols", "time control", notification.time_control.time_control, true]];
        let resultAllowedFamilies = false;
        for (let [a,b,notif,extraCondition] of testsAllowedFamilies) {
            resultAllowedFamilies = allowedFamiliesReject(a,b, notif, extraCondition, r_u_s);
            if (resultAllowedFamilies) {
                return resultAllowedFamilies;
            }
        }

        for (let blitzLiveCorr of ["blitz", "live", "corr"]) {
            if (notification.time_control.speed === convertBlitzLiveCorr(blitzLiveCorr)) {
                const testsBLC = [[`maintime${blitzLiveCorr}`, "main time", notification.time_control],
                                  [`periods${blitzLiveCorr}`, "number of periods", notification.time_control.periods],
                                  [`periodtime${blitzLiveCorr}`, "period time", notification.time_control]];
                let resultBLC = false;
                for (let [a,b,c] of testsBLC) {
                    resultBLC = genericMinMaxReject(a,b,c, false, true, r_u_s);
                    if (resultBLC) {
                        return resultBLC;
                    }
                }
            }
        }

        return { reject: false };  // Ok !

    } /* }}} */
    // Check challenge entirely, and return reject status + optional error msg.
    //
    checkChallenge(notification) { /* {{{ */

        // choose exports["ranked"] or exports["unranked"] depending on notification.ranked
        const r_u_s = rankedorUnrankedString(notification.ranked, notification.time_control.speed);

        const c1 = this.checkChallengePreRequirements(notification, r_u_s);
        if (c1.reject)  return c1;

        const c2 = this.checkChallengeSettings(notification, r_u_s);
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

function rankedorUnrankedString(notificationRanked, notificationTSpeed) { /* {{{ */
    let rankedUnranked = "unranked";
    if (notificationRanked) {
        rankedUnranked = "ranked";
    }
    config[rankedUnranked].r_u_s.for_blc_r_u_games = `for ${notificationTSpeed} ${rankedUnranked} games`;
    return config[rankedUnranked].r_u_s;
    /*ex: config.ranked.r_u_s = {r_u: "ranked",
                                 for_r_u_games: "for ranked games",
                                 from_r_u_games: "from ranked games",
                                 for_blc_r_u_games: "for blitz ranked games"};*/
} /* }}} */

function customBoardsizeWidthsHeightsReject(familyNameString, name, notificationWidth, notificationHeight, r_u_s) { /* {{{ */
    let notificationWH = notificationWidth;
    if (familyNameString.includes("height")) {
        notificationWH = notificationHeight;
    }
    conn_log(`${name} -${notificationWH}- ${r_u_s.for_r_u_games}, not in -${config[r_u_s.r_u][familyNameString]}- `);
    return { reject: true, msg: `In your selected board size ${notificationWidth} x ${notificationHeight} (width x height), ${name} (${notificationWH}) is not allowed ${r_u_s.for_r_u_games} on this bot, please choose among: ${config[r_u_s.r_u][familyNameString]}` };
} /* }}} */

function allowedFamiliesReject(familyNameString, name, notif, extraCondition, r_u_s) { /* {{{ */
    if (extraCondition && (!config[r_u_s.r_u][`allow_all_${familyNameString}`])
        && (!config[r_u_s.r_u][`allowed_${familyNameString}`][notif])) {
        let argValueConverted = config[r_u_s.r_u][familyNameString];
        let notifConverted = notif;
        if (familyNameString === "boardsizes") {
            argValueConverted = boardsizeSquareToDisplayString(argValueConverted);
            notifConverted = boardsizeSquareToDisplayString(notif);
        } else if ((familyNameString === "komis") && (notif === null)) {
            notifConverted = "automatic";
        }
        conn_log(`${name} -${notifConverted}- ${r_u_s.for_r_u_games}, not in -${argValueConverted}- `);
        return { reject: true, msg: `${name} -${notifConverted}- is not allowed on this bot ${r_u_s.for_r_u_games}, please choose among: -${argValueConverted}-` };
    }
} /* }}} */

function booleanReject(familyNameString, name, r_u_s) { /* {{{ */
    conn_log(`${name} is not allowed ${r_u_s.for_r_u_games} (--${familyNameString})`);
    return { reject: true, msg: `${name} is not allowed on this bot ${r_u_s.for_r_u_games}` };
}  /* }}} */

function genericMinMaxReject(familyNameString, name, familyNotification, notificationHandicap, isBLC, r_u_s) { /* {{{ */
    const minFamilyObject = familyObjectMIBLIsminmax("min", familyNameString, r_u_s);
    const maxFamilyObject = familyObjectMIBLIsminmax("max", familyNameString, r_u_s);
    let argConverted = -1;
    let condition = false;
    let UHMAEATResult = {};
    for (let familyObject of [minFamilyObject, maxFamilyObject]) {
        if (familyObject.arg) { // avoid undefined
            argConverted = familyObject.arg;
            if (familyNameString.includes("maintime") || familyNameString.includes("periodtime")) {
                UHMAEATResult = UHMAEAT(argConverted, familyNameString, familyNotification);
                argConverted = UHMAEATResult.arg;
                condition = UHMAEATResult.condition;
            } else {
                condition = minmaxCondition(argConverted, familyNotification, familyObject.isMM.isMin);
            }
            if (condition) {
                let nameConverted = name;
                let familyNotificationConverted = familyNotification;
                let extraFamilyInfo = "";
                let for_r_u_games_converted = r_u_s.for_r_u_games;
                let endingSentence = "";
                if (familyNameString === "handicap") {
                    endingSentence = `please ${familyObject.MIBL.incDec} the number of ${name}`;
                    // fakerank specific reject
                    if (notificationHandicap === -1 && config[r_u_s.r_u].fakerank) {
                        conn_log(`Automatic handicap ${for_r_u_games_converted} was set to ${familyNotificationConverted} ${name}, but ${familyObject.MIBL.minMax} ${for_r_u_games_converted} is ${argConverted} ${name}`);
                        return { reject: true, msg: `-Automatic- handicap ${for_r_u_games_converted} was set to ${familyNotificationConverted} ${name} based on rank difference between you and this bot,\nBut ${familyObject.MIBL.minMax} ${name} ${for_r_u_games_converted} is ${argConverted} ${name}:\nPlease ${familyObject.MIBL.incDec} the number of ${name} in -custom- handicap.` };
                    }
                    if (familyObject.isMM.isMax && (argConverted === 0) && familyNotificationConverted > 0) {
                        extraFamilyInfo = " (even games only)";
                    } else if (familyObject.isMM.isMin && (argConverted > 0) && familyNotificationConverted === 0) {
                        extraFamilyInfo = " (handicap games only)";
                    }
                } else if (familyNameString === "rank") {
                    argConverted = rankToString(argConverted);
                    familyNotificationConverted = rankToString(familyNotificationConverted);
                    endingSentence = `your rank is too ${familyObject.MIBL.lowHig}`;
                } else if (isBLC) { // "maintime", "periods", "periodtime"
                    for_r_u_games_converted = r_u_s.for_blc_r_u_games; // ex: "for blitz ranked games"
                    if (UHMAEATResult.condition) { // "maintime", "periodtime"
                        argConverted = timespanToDisplayString(UHMAEATResult.arg); // ex: "5 minutes"
                        familyNotificationConverted = timespanToDisplayString(UHMAEATResult.notif);
                        nameConverted = `UHMAEATResult.nameMPT (${familyNotification.time_control})`; // ex: "Initial Time" (fischer)
                        if (UHMAEATResult.isCanadianPt) {
                            endingSentence = ", or change the number of stones per period";
                        }
                    }
                }
                conn_log(`${familyNotificationConverted} is ${familyObject.MIBL.belAbo} ${familyObject.MIBL.minMax} ${nameConverted} ${for_r_u_games_converted} ${argConverted}${extraFamilyInfo}`);
                return { reject: true, msg: `${familyObject.MIBL.minMax} ${nameConverted} ${for_r_u_games_converted} is ${argConverted}${extraFamilyInfo}, ${endingSentence}.` };
            }
        }
    }
} /* }}} */

function UHMAEAT(arg, familyNameString, notificationT, isMin) { /* {{{ */
    /*// UHMAEAT : Universal Highly Modulable And Expandable Argv Tree (version 5.0) ////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    / 1) "none" doesnt have a period time, so we let it slide from both maintime and periodtime rejects
    / 2) "simple" doesn't have a main time, only a period time, so we let it slide from maintime rejects
    / 3) "absolute" doesn't have a period time, so we let it slide from periodtime rejects
    / 4) - for canadian periodtimes, notificationT.period_time is already for X stones,
    /    so no need to multiply it by notificationT.stones_per_period
    /    - But when we process config[argNameString], bot admin inputs periodtime in arg as if
    /    it could be "byoyomi" or "simple" or any other standard periodtime (for 1 stone), 
    /    so we need to multiply config[argNameString] by the number of stones per period
    /    e.g. 30 seconds average period time for 1 stone = 30*20 = 600 = 10 minutes period time for all the 20 stones.*/
    let argConverted = arg;
    let isCanadianPt = false;
    const timecontrolsMTTPT = 
        { fischer:  {mt: {nameMPT: "Initial Time", notif: notificationT.initial_time},
                     mtt: {nameMPT: "Max Time", notif: notificationT.max_time},
                     pt: {nameMPT: "Increment Time", notif: notificationT.time_increment}},
          byoyomi:  {mt: {nameMPT: "Main Time", notif: notificationT.main_time},
                     pt: {nameMPT: "Period Time", notif: notificationT.period_time}},
          canadian: {mt: {nameMPT: "Main Time", notif: notificationT.main_time},
                     pt: {nameMPT: "Period Time for all the " + notificationT.stones_per_period + " stones",
                          notif: notificationT.period_time}},
          simple:   {pt: {nameMPT: "Time per move", notif: notificationT.per_move}},
          absolute: {mt: {nameMPT: "Total Time", notif: notificationT.total_time}}
        };

    let maintimeOrPeriodtime = ["mt", "mtt"];
    if (familyNameString.includes("periodtime")) {
        maintimeOrPeriodtime = ["pt"];
    }
    for (let timecontrol of ["fischer", "byoyomi", "canadian", "simple", "absolute"]) { 
        if (timecontrol === notificationT.time_control) {
            for (let mtMttOrPt of maintimeOrPeriodtime) {
                if (timecontrolsMTTPT[timecontrol][mtMttOrPt]) { // avoid undefined
                    if (timecontrol === "canadian" && mtMttOrPt === "pt") {
                        isCanadianPt = true;
                        argConverted = argConverted * notificationT.stones_per_period;
                    }
                    if (minmaxCondition(argConverted, timecontrolsMTTPT[timecontrol][mtMttOrPt].notif, isMin)) {
                        return {condition: true, arg: argConverted,
                                nameMPT: timecontrolsMTTPT[timecontrol][mtMttOrPt].nameMPT,
                                notif: timecontrolsMTTPT[timecontrol][mtMttOrPt].notif, isCanadianPt};
                    }
                }
            }
        } else {
            return {condition: false};
        }
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

function convertBlitzLiveCorr(blitzLiveCorr) { /* {{{ */
    if (blitzLiveCorr === "corr") {
        return "correspondence";
    } else {
        return blitzLiveCorr;
    }
} /* }}} */

function familyObjectMIBLIsminmax(minMax, familyNameString, r_u_s) { /* {{{ */
    let mm = "";
    let ir = "";
    let ba = "";
    let lh = "";
    const isMin = (minMax === "min");
    const isMax = (minMax === "max");
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
    return {arg: config[r_u_s.r_u][`${minMax}${familyNameString}`], //ex: config.minmaintimeblitz
            MIBL: {minMax: mm, incDec: ir, belAbo: ba, lowHig: lh},
            isMM: {isMin, isMax}};
} /* }}} */

function minmaxCondition(arg, familyNotification, isMin) { /* {{{ */
    if (isMin) {
        return familyNotification < arg; // to reject in minimum, we need notification < arg
    } else {
        return familyNotification > arg;
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
