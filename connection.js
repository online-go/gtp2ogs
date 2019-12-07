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
            return { reject: true, msg: config.REJECTNEWMSG };
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

        /*------- begining of BOARDSIZES -------*/
        // 1) for square board sizes only
        //     A) if not square
        if (notification.width !== notification.height) {
            if (!config.allow_all_boardsizes && !config.allow_custom_boardsizes && !config.boardsizesranked && !config.boardsizesunranked) {
                return boardsizeNotificationIsNotSquareReject("boardsizes", notification.width, notification.height);
            }
            if (!config.allow_all_boardsizes_ranked && !config.allow_custom_boardsizes_ranked && notification.ranked) {
                return boardsizeNotificationIsNotSquareReject("boardsizesranked", notification.width, notification.height);
            }
            if (!config.allow_all_boardsizes_unranked && !config.allow_custom_boardsizes_unranked && !notification.ranked) {
                return boardsizeNotificationIsNotSquareReject("boardsizesunranked", notification.width, notification.height);
            }
        }
        //     B) if square, check if square board size is allowed
        if (!config.allowed_boardsizes[notification.width] && !config.allow_all_boardsizes && !config.allow_custom_boardsizes && !config.boardsizesranked && !config.boardsizesunranked) {
            return genericAllowedFamiliesReject("boardsizes", notification.width);
        }
        if (!config.allowed_boardsizes_ranked[notification.width] && !config.allow_all_boardsizes_ranked && !config.allow_custom_boardsizes_ranked && notification.ranked && config.boardsizesranked) {
            return genericAllowedFamiliesReject("boardsizesranked", notification.width);
        }
        if (!config.allowed_boardsizes_unranked[notification.width] && !config.allow_all_boardsizes_unranked && !config.allow_custom_boardsizes_unranked && !notification.ranked && config.boardsizesunranked) {
            return genericAllowedFamiliesReject("boardsizesunranked", notification.width);
        }

        // 2) for custom board sizes, including square board sizes if width === height as well
        //     A) if custom, check width
        if (!config.allow_all_boardsizes && config.allow_custom_boardsizes && !config.allowed_custom_boardsizewidths[notification.width] && !config.boardsizewidthsranked && !config.boardsizewidthsunranked) {
            return customBoardsizeWidthsHeightsReject("boardsizewidths", notification.width, notification.height);
        }
        if (!config.allow_all_boardsizes_ranked && config.allow_custom_boardsizes_ranked && !config.allowed_custom_boardsizewidths_ranked[notification.width] && notification.ranked && config.boardsizewidthsranked) {
            return customBoardsizeWidthsHeightsReject("boardsizewidthsranked", notification.width, notification.height);
        }
        if (!config.allow_all_boardsizes_unranked && config.allow_custom_boardsizes_unranked && !config.allowed_custom_boardsizewidths_unranked[notification.width] && !notification.ranked && config.boardsizewidthsunranked) {
            return customBoardsizeWidthsHeightsReject("boardsizewidthsunranked", notification.width, notification.height);
        }
        //     B) if custom, check height
        if (!config.allow_all_boardsizes && config.allow_custom_boardsizes && !config.allowed_custom_boardsizeheights[notification.height] && !config.boardsizeheightsranked && !config.boardsizeheightsunranked) {
            return customBoardsizeWidthsHeightsReject("boardsizeheights", notification.width, notification.height);
        }
        if (!config.allow_all_boardsizes && config.allow_custom_boardsizes && !config.allowed_custom_boardsizeheights[notification.height] && notification.ranked && config.boardsizeheightsranked) {
            return customBoardsizeWidthsHeightsReject("boardsizeheightsranked", notification.width, notification.height);
        }
        if (!config.allow_all_boardsizes && config.allow_custom_boardsizes && !config.allowed_custom_boardsizeheights[notification.height] && !notification.ranked && config.boardsizeheightsunranked) {
            return customBoardsizeWidthsHeightsReject("boardsizeheightsunranked", notification.width, notification.height);
        }
        /*------- end of BOARDSIZES -------*/

        if (notification.handicap === -1) {
            if (config.noautohandicap && !config.noautohandicapranked && !config.noautohandicapunranked) {
                return noAutohandicapReject("noautohandicap");
            }
            if (config.noautohandicapranked && notification.ranked) {
                return noAutohandicapReject("noautohandicapranked");
            }
            if (config.noautohandicapunranked && !notification.ranked) {
                return noAutohandicapReject("noautohandicapunranked");
            }
            /***** fakerank : automatic handicap min/max handicap limits detection ******/
            if (config.fakerank) {
                /* below is a fix of automatic handicap bypass issue
                /  by manually calculating handicap stones number
                /  then calculate if it is within min/max limits set by botadmin

                /  TODO : remove all the fakerank below when server gives us support for
                /  "automatic handicap" notification object, containing both the type of 
                /  handicap "automatic"/"user-defined" as well as the number of stones in each case*/
                let fakeRankDifference = Math.abs(Math.trunc(notification.user.ranking) - Math.trunc(config.fakerank));
                /* adding a truncate because a 5.9k (6k) vs 6.1k (7k) is 0.2 rank difference,
                /  but it is in fact a still a 6k vs 7k = Math.abs(6-7) = 1 rank difference game

                /  first, if ranked game, we eliminate > 9 rank difference*/
                if (notification.ranked && (fakeRankDifference > 9)) {
                    conn_log("Rank difference > 9 in a ranked game would be 10+ handicap stones, not allowed");
                    return {reject: true, msg: "Rank difference between you and this bot is " + fakeRankDifference + "\n The difference is too big to play a ranked game with handicap (max is 9 handicap for ranked games), try unranked handicap or manually reduce the number of handicap stones in -custom handicap-"};
                }
                /* then, after eliminating > 9 rank difference if ranked, we consider value of min-max handicap if set
                /  we eliminate all unwanted values, everything not forbidden is allowed*/
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

        if (!config.allowed_komis[notification.komi] && !config.allow_all_komis && !config.komisranked && !config.komisunranked) {
            return genericAllowedFamiliesReject("komis", notification.komi);
        }
        if (!config.allowed_komis_ranked[notification.komi] && notification.ranked && !config.allow_all_komis_ranked && config.komisranked) {
            return genericAllowedFamiliesReject("komisranked", notification.komi);
        }
        if (!config.allowed_komis_unranked[notification.komi] && !notification.ranked && !config.allow_all_komis_unranked && config.komisunranked) {
            return genericAllowedFamiliesReject("komisunranked", notification.komi);
        }

        if (!config.allowed_speeds[notification.time_control.speed] && !config.speedsranked && !config.speedsunranked) {
            return genericAllowedFamiliesReject("speeds", notification.time_control.speed);
        }
        if (!config.allowed_speeds_ranked[notification.time_control.speed] && notification.ranked && config.speedsranked) {
            return genericAllowedFamiliesReject("speedsranked", notification.time_control.speed);
        }
        if (!config.allowed_speeds_unranked[notification.time_control.speed] && !notification.ranked && config.speedsunranked) {
            return genericAllowedFamiliesReject("speedsunranked", notification.time_control.speed);
        }

        // note : "absolute" and/or "none" are possible, but not in defaults, see OPTIONS-LIST for details
        if (!config.allowed_timecontrols[notification.time_control.time_control] && !config.timecontrolsranked && !config.timecontrolsunranked) { 
            return genericAllowedFamiliesReject("timecontrols", notification.time_control.time_control);
        }
        if (!config.allowed_timecontrols_ranked[notification.time_control.time_control] && notification.ranked && config.timecontrolsranked) { 
            return genericAllowedFamiliesReject("timecontrolsranked", notification.time_control.time_control);
        }
        if (!config.allowed_timecontrols_unranked[notification.time_control.time_control] && !notification.ranked && config.timecontrolsunranked) { 
            return genericAllowedFamiliesReject("timecontrolsunranked", notification.time_control.time_control);
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
    let rankedUnranked = "";
    for (let argNameString of familyArrayFromFamilyNameString(familyNameString)) {
        bannedUsersString = allowedBannedSettingExtraRankedUnranked("banned_users", argNameString);
        if ((config[bannedUsersString][notificationUserUsername]) || (config[bannedUsersString][notificationUserUsername])) {
            rankedUnranked = beforeRankedUnrankedGamesSpecial("from ", "", argNameString, "all ");
            conn_log(`Username ${notificationUserUsername}, user id ${notificationUserId}, is banned ${rankedUnranked}`);
            return { reject: true, msg: `Username ${notificationUserUsername}, user id ${notificationUserId}, is banned ${rankedUnranked} on this bot by bot admin, you may try changing the ranked/unranked setting` };
        }
    }
}  /* }}} */

function genericAllowedFamiliesReject(argNameString, notificationUnit) { /* }}} */
    const rankedUnranked = beforeRankedUnrankedGamesSpecial("for ", "", argNameString, "");
    const argFamilySingularString = pluralFamilyStringToSingularString(argNameString);
    // for example "speedsranked" -> "speed"
    let argValueString = config[argNameString];
    let notificationUnitConverted = notificationUnit;

    if (argFamilySingularString.includes("boardsize")) {
        argValueString = boardsizeSquareToDisplayString(config[argNameString]);
        // for example boardsizeSquareToDisplayString("9,13,19"]) : "9x9, 13x13, 19x19"
        notificationUnitConverted = boardsizeSquareToDisplayString(notificationUnit);
    } else if (argFamilySingularString.includes("komi") && (notificationUnit === null)) {
        notificationUnitConverted = "automatic";
    }
    conn_log(`${argFamilySingularString} ${rankedUnranked} -${notificationUnitConverted}-, not in -${argValueString}- `);
    return { reject: true, msg: `${argFamilySingularString} -${notificationUnitConverted}- is not allowed on this bot ${rankedUnranked}, please choose one of these allowed ${argFamilySingularString}s ${rankedUnranked}: -${argValueString}-` };
    /* for example : "speed -blitz- is not allowed on this bot for ranked games, please
                     choose one of these allowed speeds for ranked games: -live,correspondence-"*/
} /* }}} */

function boardsizeNotificationIsNotSquareReject(argNameString, notificationWidth, notificationHeight) { /* }}} */
    const rankedUnranked = beforeRankedUnrankedGamesSpecial("for ", "", argNameString, "");
    conn_log(`boardsize ${notificationWidth} x ${notificationHeight} is not square, not allowed ${rankedUnranked}`);
    return { reject: true, msg: `Your selected board size ${notificationWidth} x ${notificationHeight} is not square, not allowed ${rankedUnranked} on this bot, please choose a SQUARE board size (same width and height), for example try 9x9 or 19x19}` };
} /* }}} */

function customBoardsizeWidthsHeightsReject(argNameString, notificationWidth, notificationHeight) { /* }}} */
    const rankedUnranked = beforeRankedUnrankedGamesSpecial("for ", "", argNameString, "");
    let widthHeight = "width";
    let notificationUnit = notificationWidth;
    if (argNameString.includes("height")) {
        widthHeight = "height";
        notificationUnit = notificationHeight;
    }
    conn_log(`boardsize ${widthHeight} ${rankedUnranked} -${notificationUnit}-, not in -${config[argNameString]}- `);
    return { reject: true, msg: `In your selected board size ${notificationWidth} x ${notificationHeight} (width x height), boardsize ${widthHeight.toUpperCase()} (${notificationUnit}) is not allowed ${rankedUnranked} on this bot, please choose one of these allowed CUSTOM boardsize ${widthHeight.toUpperCase()}S values ${rankedUnranked}: ${config[argNameString]}` };
    /* for example : In your selected board size 15 x 2 (width x height), boardsize WIDTH (15)
    /  is not allowed for ranked games on this bot, please choose one of these allowed CUSTOM 
    /  boardsize WIDTHS values for ranked games: 17,19,25 */
} /* }}} */

function noAutohandicapReject(argNameString) { /* }}} */
    const rankedUnranked = beforeRankedUnrankedGamesSpecial("for ", "", argNameString, "");
    conn_log(`no autohandicap ${rankedUnranked}`);
    return { reject: true, msg: `For easier bot management, -automatic- handicap is disabled on this bot ${rankedUnranked}, please manually select the number of handicap stones you want in -custom handicap-, for example 2 handicap stones, you may try changing the ranked/unranked setting` };
}  /* }}} */

// minmax families reject functions :
function minmaxPeriodsActualReject(familyNameString, familyNotification, notificationTSpeed, notificationRanked) { /* }}} */
    /* "fischer", "simple", "absolute", "none", don't have a periods number,
    /  so this function only applies to "byoyomi" and "canadian"*/
    for (let blitzLiveCorr of ["blitz", "live", "corr"]) {
        if (notificationTSpeed === convertBlitzLiveCorr(blitzLiveCorr)) {
            const minFamilyObject = familyObjectMIBLIsminmax("min" + familyNameString + blitzLiveCorr);
            const maxFamilyObject = familyObjectMIBLIsminmax("max" + familyNameString + blitzLiveCorr);
            /* example : {argNameStrings {all: "minperiodsblitz", ranked: "minperiodsblitzranked", unranked: "minperiodsblitzunranked"},
                                    MIBL {minMax: mm, incDec: ir, belAbo: ba, lowHig: lh},
                                    isMM {isMin: true, isMax: false}};*/
            let argNameString = "";
            for (let familyObject of [minFamilyObject, maxFamilyObject]) {
                argNameString = checkObjectArgsToArgNameString(familyObject.argNameStrings, notificationRanked);
                if (minmaxCondition(config[argNameString], familyNotification, familyObject.isMM.isMin)) { // if we dont reject, we early exit all the remaining reject
                    const rankedUnranked = beforeRankedUnrankedGamesSpecial("for ", notificationTSpeed + " ", argNameString, "");
                    conn_log(`${familyNotification} is ${familyObject.MIBL.belAbo} ${familyObject.MIBL.minMax} ${familyNameString} ${rankedUnranked} ${config[argNameString]}`);
                    return { reject: true, msg: `${familyObject.MIBL.minMax} ${familyNameString} ${rankedUnranked} ${config[argNameString]}, please ${familyObject.MIBL.incDec} the number of ${familyNameString}.` };
                }
            }
        }
    }
}

function minmaxHandicapRankActualReject(familyNameString, familyNotification, notificationHandicap, notificationRanked) {
    const minFamilyObject = familyObjectMIBLIsminmax("min" + familyNameString);
    const maxFamilyObject = familyObjectMIBLIsminmax("max" + familyNameString);
    let argNameString = "";
    for (let familyObject of [minFamilyObject, maxFamilyObject]) {
        argNameString = checkObjectArgsToArgNameString(familyObject.argNameStrings, notificationRanked);
        if (config[argNameString] && minmaxCondition(config[argNameString], familyNotification, familyObject.isMM.isMin)) { // add an if arg check, because we dont provide defaults for all arg families
            let argToString = config[argNameString];
            let familyNameStringConverted = familyNameString;
            let familyNotificationConverted = familyNotification;
            let rankedUnranked = beforeRankedUnrankedGamesSpecial("for ", "", argNameString, "");
            let endingSentence = "";
            if (familyNameString === "handicap") {
                familyNameStringConverted = "handicap stones";
                endingSentence = `please ${familyObject.MIBL.incDec} the number of ${familyNameStringConverted}`;
                // handicap specific rejects below :
                if (familyObject.isMM.isMin && familyNotificationConverted === 0 && config[argNameString] > 0) {
                    rankedUnranked = beforeRankedUnrankedGamesSpecial("", "even ", argNameString, "");
                    conn_log(`No ${rankedUnranked} (handicap games only)`);
                    return { reject: true, msg: `This bot does not play ${rankedUnranked}, please manually select the number of ${familyNameStringConverted} in -custom handicap- : minimum is ${argToString} ${familyNameStringConverted}, or try changing ranked/unranked game setting.` };
                } else if (familyObject.isMM.isMax && familyNotificationConverted > 0 && config[argNameString] === 0) {
                    rankedUnranked = beforeRankedUnrankedGamesSpecial("", "handicap ", argNameString, "");
                    conn_log(`No ${rankedUnranked} (even games only)'`);
                    return { reject: true, msg: `This bot does not play ${rankedUnranked}, please choose handicap -none- (0 handicap stones), or try changing ranked/unranked game setting.` };
                } else if (notificationHandicap === -1 && config.fakerank) { // fakerank specific reject
                    conn_log(`Automatic handicap ${rankedUnranked} was set to ${familyNotificationConverted} stones, but ${familyObject.MIBL.minMax} handicap ${rankedUnranked} is ${argToString} stones`);
                    return { reject: true, msg: `Your automatic handicap ${rankedUnranked} was automatically set to ${familyNotificationConverted} stones based on rank difference between you and this bot,\nBut ${familyObject.MIBL.minMax} handicap ${rankedUnranked} is ${argToString} stones \nPlease ${familyObject.MIBL.incDec} the number of handicap stones in -custom handicap- instead of -automatic handicap-` };
                }
            } else if (familyNameString === "rank") {
                argToString = rankToString(config[argNameString]);
                familyNotificationConverted = rankToString(familyNotificationConverted);
                endingSentence = `your rank is too ${familyObject.MIBL.lowHig}`;
            }
            // if we are not in any "handicap" specific reject case, we return the generic return below instead :
            conn_log(`${familyNotificationConverted} is ${familyObject.MIBL.belAbo} ${familyObject.MIBL.minMax} ${familyNameStringConverted} ${rankedUnranked} ${argToString}`);
            return { reject: true, msg: `${familyObject.MIBL.minMax} ${familyNameStringConverted} ${rankedUnranked} is ${argToString}, ${endingSentence}.` };
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
    /    - But when we process config[argNameString], bot admin inputs periodtime in arg as if
    /    it could be "byoyomi" or "simple" or any other standard periodtime (for 1 stone), 
    /    so we need to multiply config[argNameString] by the number of stones per period
    /    e.g. 30 seconds average period time for 1 stone = 30*20 = 600 = 10 minutes period time for all the 20 stones.*/

    for (let blitzLiveCorr of ["blitz", "live", "corr"]) {
        if (notificationT.speed === convertBlitzLiveCorr(blitzLiveCorr)) {
            const minFamilyObject = familyObjectMIBLIsminmax("min" + mainPeriodTime + blitzLiveCorr);
            const maxFamilyObject = familyObjectMIBLIsminmax("max" + mainPeriodTime + blitzLiveCorr);
            const timecontrolsSettings = timecontrolsMainPeriodTime(mainPeriodTime, notificationT);
            let argNameString = "";
            let argNumberConverted = -1;
            for (let familyObject of [minFamilyObject, maxFamilyObject]) {
                for (let setting of timecontrolsSettings) {
                    if (notificationT.time_control === setting[0]) {
                        argNameString = checkObjectArgsToArgNameString(familyObject.argNameStrings, notificationRanked);
                        argNumberConverted = config[argNameString];
                        if (setting[0] === "canadian" && mainPeriodTime === "periodtime") {
                            argNumberConverted = argNumberConverted * notificationT.stones_per_period;
                        }
                        if (minmaxCondition(argNumberConverted, setting[2], familyObject.isMM.isMin)) { // if we dont reject, we early exit all the remaining reject
                            const argToString = timespanToDisplayString(argNumberConverted); // ex: "1 minutes"
                            const rankedUnranked = beforeRankedUnrankedGamesSpecial("for ", notificationT.speed + " ", argNameString, "");
                            let endingSentence = "";
                            if ((notificationT.time_control === "canadian") && (mainPeriodTime === "periodtime")) {
                                endingSentence = ", or change the number of stones per period";
                            }
                            conn_log(`${timespanToDisplayString(setting[2])} is ${familyObject.MIBL.belAbo} ${familyObject.MIBL.minMax} ${setting[1]} ${rankedUnranked} in ${notificationT.time_control} ${argToString}`);
                            return { reject : true, msg: `${familyObject.MIBL.minMax} ${setting[1]} ${rankedUnranked} in ${notificationT.time_control} is ${argToString}, please ${familyObject.MIBL.incDec} ${setting[1]}${endingSentence}.` };
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

function pluralFamilyStringToSingularString(plural) { /* {{{ */
    let pluralToConvert = plural.split("unranked")[0].split("ranked")[0].split("");
    // for example "speedsranked" -> ["s", "p", "e", "e", "d", "s"]
    pluralToConvert.pop();
    // for example ["s", "p", "e", "e", "d", "s"] -> ["s", "p", "e", "e", "d"]
    pluralToConvert = pluralToConvert.join("");
    // for example ["s", "p", "e", "e", "d"] -> "speed"
    return pluralToConvert;
} /* }}} */

function convertBlitzLiveCorr(blitzLiveCorr) { /* {{{ */
    if (blitzLiveCorr === "corr") {
        return "correspondence";
    } else {
        return blitzLiveCorr;
    }
} /* }}} */

function familyArrayFromFamilyNameString(familyNameString) { /* {{{ */
    return ["", "ranked", "unranked"].map(e => familyNameString + e);
} /* {{{ */

function familyObjectMIBLIsminmax(familyNameString) { /* {{{ */
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
    const familyArray = familyArrayFromFamilyNameString(familyNameString);
    return {argNameStrings: {all: familyArray[0], ranked: familyArray[1], unranked: familyArray[2]},
                      MIBL: {minMax: mm, incDec: ir, belAbo: ba, lowHig: lh},
                      isMM: {isMin, isMax}};
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

function allowedBannedSettingExtraRankedUnranked(allowedBannedSetting,argNameString) { /* {{{ */
    if (argNameString.includes("unranked")) {
        return `${allowedBannedSetting}_unranked`;
    } else if (argNameString.includes("ranked")) {
        return `${allowedBannedSetting}_ranked`;
    } else {
        return allowedBannedSetting;
    }
} /* {{{ */

function checkObjectArgsToArgNameString(familyObjectArgNameStrings, notificationRanked) { /* {{{ */
    if (config[familyObjectArgNameStrings.unranked] && !notificationRanked) {
        return familyObjectArgNameStrings.unranked;
    } else if (config[familyObjectArgNameStrings.ranked] && notificationRanked) {
        return familyObjectArgNameStrings.ranked;
    } else { /* beware : since we don't always provide defaults for the general arg, we would 
             /  need to check it if we use this function in other functions than the minmax ones (ex: minrank, minhandicap) */ 
        return familyObjectArgNameStrings.all;
    }
} /* }}} */

function minmaxCondition(argNumber, familyNotification, isMin) { /* {{{ */
    if (isMin) {
        return familyNotification < argNumber; // to reject in minimum, we need notification < arg
    } else {
        return familyNotification > argNumber;
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
