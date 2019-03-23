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
        this.games_by_player = {};     // Keep track of connected games per player
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
            //
            this.corr_queue_interval = setInterval(() => {
                // If a game needs a move and we aren't already working on one, make a move
                //
                if (Game.corr_moves_processing === 0) {
                    // Choose a corr game to make a move
                    // TODO: Choose the game with least time remaining
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
             * notifications that got lost in the shuffle... and maybe someday
             * we'll get it figured out how this happens in the first place. */
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

            // OGS auto scores bot games now, no removal processing is needed by the bot.
            //
            // Eventually might want OGS to not auto score, or make it bot-optional to enforce.
            // Some bots can handle stone removal process.
            //
            /* if (gamedata.phase === 'stone removal'
                && ((!gamedata.black.accepted && gamedata.black.id === this.bot_id)
                ||  (!gamedata.white.accepted && gamedata.white.id === this.bot_id))
               ) {
                this.processMove(gamedata);
            } */

            if (gamedata.phase === "finished") {
                if (gamedata.id in this.connected_games) {
                    // When a game ends, we don't get a "finished" active_game.phase. Probably since the game is no
                    // longer active.(Update: We do get finished active_game events? Unclear why I added prior note.)
                    // Note: active_game and gamedata events can arrive in either order.
                    //
                    if (config.DEBUG) conn_log(gamedata.id, "active_game phase === finished");

                    // XXX We want to disconnect right away here, but there's a game over race condition
                    //     on server side: sometimes /gamedata event with game outcome is sent after
                    //     active_game, so it's lost since there's no game to handle it anymore...
                    //     Work around it with a timeout for now.
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
        conn_log('Dumping status of all connected games');
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
        conn_log('Dump complete');
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
    // Check user is acceptable
    //
    checkUser(notification) { /* {{{ */
        let user = notification.user;

        if (config.banned_users[user.username] || config.banned_users[user.id]) {
            conn_log(user.username + " (" + user.id + ") is banned, rejecting challenge");
            return { reject: true };
        } else if (notification.ranked && (config.banned_users_ranked[user.username] || config.banned_users_ranked[user.id])) {
            conn_log(user.username + " (" + user.id + ") is banned from ranked games, rejecting challenge");
            return { reject: true };
        } else if (!notification.ranked && (config.banned_users_unranked[user.username] || config.banned_users_unranked[user.id])) {
            conn_log(user.username + " (" + user.id + ") is banned from unranked games, rejecting challenge");
            return { reject: true };
        }

        if (config.proonly && !user.professional) {
            conn_log(user.username + " is not a professional");
            return { reject: true, msg: "You are not a professional player, this bot accepts games vs professionals only. " };
        }

        let connected_games_per_user = this.gamesForPlayer(user.id);

        if (config.maxconnectedgamesperuser && connected_games_per_user >= config.maxconnectedgamesperuser) {
            conn_log("Too many connected games for this user.");
            return { reject: true, msg: "Maximum number of simultaneous games allowed per player against this bot is " + config.maxconnectedgamesperuser + " , please reduce your number of connected games against this bot, and try again" };
        }

        if (this.connected_games) {
            if (config.DEBUG) console.log("# of connected games = " + Object.keys(this.connected_games).length);
        } else {
            if (config.DEBUG) console.log("There are no connected games");
        }

        if (config.maxconnectedgames && this.connected_games && Object.keys(this.connected_games).length >= config.maxconnectedgames){
            conn_log(Object.keys(this.connected_games).length + " games being played, maximum is " + config.maxconnectedgames);
            return { reject: true, msg: "Currently, " + Object.keys(this.connected_games).length + " games are being played by this bot, maximum is " + config.maxconnectedgames + " (if you see this message and you dont see any game on the bot profile page, it is because private game(s) are being played) , try again later " };
        }

        if ((user.ranking < config.minrank) && !config.minrankranked && !config.minrankunranked) {
            minmaxRankFamilyReject("minrank")
        }
        if ((user.ranking < config.minrankranked) && notification.ranked) {
            minmaxRankFamilyReject("minrankranked")
        }
        if ((user.ranking < config.minrankunranked) && !notification.ranked) {
            minmaxRankFamilyReject("minrankunranked")
        }
        if ((user.ranking > config.maxrank) && !config.maxrankranked && !config.maxrankunranked) {
            minmaxRankFamilyReject("maxrank")
        }
        if ((user.ranking > config.maxrankranked) && notification.ranked) {
            minmaxRankFamilyReject("maxrankranked")
        }
        if ((user.ranking > config.maxrankunranked) && !notification.ranked) {
            minmaxRankFamilyReject("maxrankunranked")
        }

        return { reject: false }; // OK !

        function minmaxRankFamilyReject(argNameString) {
            // first, we define rankedUnranked, lowHigh, minMax, and humanReadableRank, depending on argNameString
            let rankedUnranked = "";
            // if argNameString does not include "ranked" or "unranked", we keep default value for rankedunranked
            if (argNameString.includes("ranked") && !argNameString.includes("unranked")) {
                rankedUnranked = "for ranked games ";
            } else if (argNameString.includes("unranked")) {
                rankedUnranked = "for unranked games ";
            }

            let minMax = "";
            let lowHigh = "";
            if (argNameString.includes("min")) {
                minMax = "Min";
                lowHigh = "low";
            } else if (argNameString.includes("max")) {
                minMax = "Max";
                lowHigh = "high";
            }

            // then we define humanReadable ranks
            let humanReadableUserRank = rankToString(user.ranking);
            let humanReadableMinmaxRank = rankToString(config[argNameString]);

            // then finally, the actual reject :
            conn_log(`${user.username} ranking ${humanReadableUserRank} too ${lowHigh} ${rankedUnranked}: ${minMax} ${rankedUnranked}is ${humanReadableMinmaxRank}`);
            return { reject: true, msg: `${minMax} rank ${rankedUnranked}is ${config[argNameString]}, your rank is too ${lowHigh} ${rankedUnranked}` };
        }

    } /* }}} */
    // Check game settings are acceptable
    //
    checkGameSettings(notification) { /* {{{ */
        let t = notification.time_control;
        let user = notification.user;

        // Sanity check, user can't choose rules. Bots only play chinese.
        if (["chinese"].indexOf(notification.rules) < 0) {
            conn_log("Unhandled rules: " + notification.rules + ", rejecting challenge");
            return { reject: true, msg: "The " + notification.rules + " rules are not allowed for this bot, please choose allowed rules such as chinese rules. " };
        }

        if (config.rankedonly && !notification.ranked) {
            conn_log("Ranked games only");
            return { reject: true, msg: "This bot accepts ranked games only. " };
        }

        if (config.unrankedonly && notification.ranked) {
            conn_log("Unranked games only");
            return { reject: true, msg: "This bot accepts Unranked games only. " };
        }

        // for all the allowed_family options below 
        // (boardsizes, komis, timecontrols, speeds) 
        // we need to add a "family guard" 
        // && config.familyranked for ranked games 
        // && config.familyunranked for unranked games
        // else the allowed_ is always false and always rejects
        // note : the exception to that rule is the banned_ family :
        // for banned_ , it is possible to use 
        // --bans and/or --bansranked and/or --bansunranked
        // all at the same time if bot admin wants

        /******** begining of BOARDSIZES *********/
        // for square board sizes only //
        /* if not square*/
        if (notification.width !== notification.height && !config.allow_all_boardsizes && !config.allow_custom_boardsizes && !config.boardsizesranked && !config.boardsizesunranked) {
            conn_log("board was not square, not allowed");
            return { reject: true, msg: "Your selected board size " + notification.width + "x" + notification.height + " (width x height), is not square, not allowed, please choose a square board size (same width and height, for example 9x9 or 19x19). " };
        }

        if (notification.width !== notification.height && !config.allow_all_boardsizes_ranked && !config.allow_custom_boardsizes_ranked && notification.ranked) {
            conn_log("board was not square, not allowed for ranked games");
            return { reject: true, msg: "Your selected board size " + notification.width + "x" + notification.height + " (width x height), is not square, not allowed for ranked games, please choose a square board size (same width and height, for example 9x9 or 19x19). " };
        }

        if (notification.width !== notification.height && !config.allow_all_boardsizes_unranked && !config.allow_custom_boardsizes_unranked && !notification.ranked) {
            conn_log("board was not square, not allowed for unranked games");
            return { reject: true, msg: "Your selected board size " + notification.width + "x" + notification.height + " (width x height), is not square, not allowed for unranked games, please choose a square board size (same width and height, for example 9x9 or 19x19). " };
        }

        /* if square, check if square board size is allowed*/
        if (!config.allowed_boardsizes[notification.width] && !config.allow_all_boardsizes && !config.allow_custom_boardsizes && !config.boardsizesranked && !config.boardsizesunranked) {
            genericAllowedFamiliesReject("boardsizes", notification.width);
        }

        if (!config.allowed_boardsizes_ranked[notification.width] && !config.allow_all_boardsizes_ranked && !config.allow_custom_boardsizes_ranked && notification.ranked && config.boardsizesranked) {
            genericAllowedFamiliesReject("boardsizesranked", notification.width);
        }

        if (!config.allowed_boardsizes_unranked[notification.width] && !config.allow_all_boardsizes_unranked && !config.allow_custom_boardsizes_unranked && !notification.ranked && config.boardsizesunranked) {
            genericAllowedFamiliesReject("boardsizesunranked", notification.width);
        }

        // for custom board sizes, including square board sizes if width === height as well //
        /* if custom, check width */
        if (!config.allow_all_boardsizes && config.allow_custom_boardsizes && !config.allowed_custom_boardsizewidths[notification.width] && !config.boardsizewidthsranked && !config.boardsizewidthsunranked) {
            conn_log("custom board width " + notification.width + " is not an allowed custom board width");
            return { reject: true, msg: "In your selected board size " + notification.width + "x" + notification.height + " (width x height), board WIDTH (" + notification.width + ") is not allowed, please choose one of these allowed CUSTOM board WIDTH values : " + config.boardsizewidths };
        }

        if (!config.allow_all_boardsizes_ranked && config.allow_custom_boardsizes_ranked && !config.allowed_custom_boardsizewidths_ranked[notification.width] && notification.ranked && config.boardsizewidthsranked) {
            conn_log("custom board width " + notification.width + " is not an allowed custom board width for ranked games");
            return { reject: true, msg: "In your selected board size " + notification.width + "x" + notification.height + " (width x height), board WIDTH (" + notification.width + ") is not allowed for ranked games, please choose one of these allowed CUSTOM board WIDTH values for ranked games : " + config.boardsizewidthsranked };
        }

        if (!config.allow_all_boardsizes_unranked && config.allow_custom_boardsizes_unranked && !config.allowed_custom_boardsizewidths_unranked[notification.width] && !notification.ranked && config.boardsizewidthsunranked) {
            conn_log("custom board width " + notification.width + " is not an allowed custom board width for unranked games");
            return { reject: true, msg: "In your selected board size " + notification.width + "x" + notification.height + " (width x height), board WIDTH (" + notification.width + ") is not allowed for unranked games, please choose one of these allowed CUSTOM board WIDTH values for unranked games : " + config.boardsizewidthsunranked };
        }

        /* if custom, check height */
        if (!config.allow_all_boardsizes && config.allow_custom_boardsizes && !config.allowed_custom_boardsizeheights[notification.height] && !config.boardsizeheightsranked && !config.boardsizeheightsunranked) {
            conn_log("custom board height " + notification.height + " is not an allowed custom board height");
            return { reject: true, msg: "In your selected board size " + notification.width + "x" + notification.height + " (width x height), board HEIGHT (" + notification.height + ") is not allowed, please choose one of these allowed CUSTOM board HEIGHT values : " + config.boardsizeheights };
        }

        if (!config.allow_all_boardsizes && config.allow_custom_boardsizes && !config.allowed_custom_boardsizeheights[notification.height] && notification.ranked && config.boardsizeheightsranked) {
            conn_log("custom board height " + notification.height + " is not an allowed custom board height for ranked games ");
            return { reject: true, msg: "In your selected board size " + notification.width + "x" + notification.height + " (width x height), board HEIGHT (" + notification.height + ") is not allowed for ranked games, please choose one of these allowed CUSTOM board HEIGHT values for ranked games: " + config.boardsizeheights };
        }

        if (!config.allow_all_boardsizes && config.allow_custom_boardsizes && !config.allowed_custom_boardsizeheights[notification.height] && !notification.ranked && config.boardsizeheightsunranked) {
            conn_log("custom board height " + notification.height + " is not an allowed custom board height for unranked games ");
            return { reject: true, msg: "In your selected board size " + notification.width + "x" + notification.height + " (width x height), board HEIGHT (" + notification.height + ") is not allowed for unranked games, please choose one of these allowed CUSTOM board HEIGHT values for unranked games: " + config.boardsizeheights };
        }
        /******** end of BOARDSIZES *********/

        if (notification.handicap === -1 && config.noautohandicap) {
            conn_log("no autohandicap");
            return { reject: true, msg: "For easier bot management, automatic handicap is disabled on this bot, please manually select the number of handicap stones you want in -custom handicap-, for example 2 handicap stones" };
	}

        if (notification.handicap === -1 && config.noautohandicapranked && notification.ranked) {
            conn_log("no autohandicap for ranked games");
            return { reject: true, msg: "For easier bot management, automatic handicap is disabled for ranked games on this bot, please manually select the number of handicap stones you want in -custom handicap-, for example 2 handicap stones" };
	}

        if (notification.handicap === -1 && config.noautohandicapunranked && !notification.ranked) {
            conn_log("no autohandicap for unranked games");
            return { reject: true, msg: "For easier bot management, automatic handicap is disabled for unranked games on this bot, please manually select the number of handicap stones you want in -custom handicap-, for example 2 handicap stones" };
	}

        /***** automatic handicap min/max handicap limits detection ******/

        // below is a fix of automatic handicap bypass issue
        // by manually calculating handicap stones number
        // then calculate if it is within set min/max
        // limits set by botadmin

        // TODO : for all the code below, replace "fakerank" with 
        // notification.bot.ranking (server support for bot ranking detection 
        // in gtp2ogs)

        if (notification.handicap === -1 && !config.noautohandicap && !config.noautohandicapranked && !config.noautohandicapunranked) {
            let rankDifference = Math.abs(Math.trunc(user.ranking) - Math.trunc(config.fakerank));
            // adding a trunk because a 5.9k (6k) vs 6.1k (7k) is 0.2 rank difference,
            // but it is in fact a still a 6k vs 7k = Math.abs(6-7) = 1 rank difference game

            // first, if ranked game, we eliminate > 9 rank difference
            if (notification.ranked && (rankDifference > 9)) {
                conn_log("Rank difference > 9 in a ranked game would be 10+ handicap stones, not allowed");
                return {reject: true, msg: "Rank difference between you and this bot is " + rankDifference + "\n The difference is too big to play a ranked game with handicap (max is 9 handicap for ranked games), try unranked handicap or manually reduce the number of handicap stones in -custom handicap-"};
            }

            // then, after eliminating > 9 rank difference if ranked, we consider value of min-max handicap if set
            // we eliminate all unwanted values, everything not forbidden is allowed
            if (config.minhandicap && !config.minhandicapranked && !config.minhandicapunranked && (rankDifference < config.minhandicap)) {
                automaticHandicapStoneDetectionReject("minhandicap");
            }
            if (config.minhandicapranked && notification.ranked && (rankDifference < config.minhandicapranked)) {
                automaticHandicapStoneDetectionReject("minhandicapranked");
            }
            if (config.minhandicapunranked && !notification.ranked && (rankDifference < config.minhandicapunranked)) {
                automaticHandicapStoneDetectionReject("minhandicap");
            }
            if (config.maxhandicap && !config.maxhandicapranked && !config.maxhandicapunranked && (rankDifference > config.maxhandicap)) {
                automaticHandicapStoneDetectionReject("maxhandicap");
            }
            if (config.maxhandicapranked && notification.ranked && (rankDifference > config.maxhandicapranked)) {
                automaticHandicapStoneDetectionReject("maxhandicapranked");
            }
            if (config.maxhandicapunranked && !notification.ranked && (rankDifference > config.maxhandicapunranked)) {
                automaticHandicapStoneDetectionReject("maxhandicapunranked");
            }
        }
        /***** end of automatic handicap min/max handicap limits detection ******/


        if (notification.handicap < config.minhandicap && !config.minhandicapranked && !config.minhandicapunranked) {
            minmaxHandicapFamilyReject("minhandicap");
        }
        if (notification.handicap < config.minhandicapranked && notification.ranked) {
            minmaxHandicapFamilyReject("minhandicapranked");
        }
        if (notification.handicap < config.minhandicapunranked && !notification.ranked) {
            minmaxHandicapFamilyReject("minhandicapunranked");
        }
        if (notification.handicap > config.maxhandicap && !config.maxhandicapranked && !config.maxhandicapunranked) {
            minmaxHandicapFamilyReject("maxhandicap");
        }
        if (notification.handicap > config.maxhandicapranked && notification.ranked) {
            minmaxHandicapFamilyReject("maxhandicapranked");
        }
        if (notification.handicap > config.maxhandicapunranked && !notification.ranked) {
            minmaxHandicapFamilyReject("maxhandicapunranked");
        }

        if (!config.allowed_komis[notification.komi] && !config.allow_all_komis && !config.komisranked && !config.komisunranked) {
            genericAllowedFamiliesReject("komis", notification.komi);
        }

        if (!config.allowed_komis_ranked[notification.komi] && notification.ranked && !config.allow_all_komis_ranked && config.komisranked) {
            genericAllowedFamiliesReject("komisranked", notification.komi);
        }

        if (!config.allowed_komis_unranked[notification.komi] && !notification.ranked && !config.allow_all_komis_unranked && config.komisunranked) {
            genericAllowedFamiliesReject("komisunranked", notification.komi);
        }

        if (!config.allowed_speeds[t.speed] && !config.speedsranked && !config.speedsunranked) {
            genericAllowedFamiliesReject("speeds", t.speed);
        }

        if (!config.allowed_speeds_ranked[t.speed] && notification.ranked && config.speedsranked) {
            genericAllowedFamiliesReject("speedsranked", t.speed);
        }

        if (!config.allowed_speeds_unranked[t.speed] && !notification.ranked && config.speedsunranked) {
            genericAllowedFamiliesReject("speedsunranked", t.speed);
        }

        // note : "absolute" and/or "none" are possible, but not in defaults, see README and OPTIONS-LIST for details
        if (!config.allowed_timecontrols[t.time_control] && !config.timecontrolsranked && !config.timecontrolsunranked) { 
            genericAllowedFamiliesReject("timecontrols", t.time_control);
        }

        if (!config.allowed_timecontrols_ranked[t.time_control] && notification.ranked && config.timecontrolsranked) { 
            genericAllowedFamiliesReject("timecontrolsranked", t.time_control);
        }

        if (!config.allowed_timecontrols_unranked[t.time_control] && !notification.ranked && config.timecontrolsunranked) { 
            genericAllowedFamiliesReject("timecontrolsunranked", t.time_control);
        }

        ////// begining of *** UHMAEAT v2.3: Universal Highly Modulable And Expandable Argv Tree ***
        ///// version 2.3 for maintimes
        if (config.minmaintimeblitz || config.minmaintimeblitzranked || config.minmaintimeblitzunranked || config.maxmaintimeblitz || config.maxmaintimeblitzranked || config.maxmaintimeblitzunranked || config.minmaintimelive || config.minmaintimeliveranked || config.minmaintimeliveunranked || config.maxmaintimelive || config.maxmaintimeliveranked || config.maxmaintimeliveunranked || config.minmaintimecorr || config.minmaintimecorrranked || config.minmaintimecorrunranked || config.maxmaintimecorr || config.maxmaintimecorrranked || config.maxmaintimecorrunranked) {
            // later the t.time_control and t.speed can't be used for rule detection for some reason,
            // so storing them now in strings while we can
            // also, whenever before TimecontrolString and SpeedString are going to be tested,
            // we always make sure they have the latest refreshed value
            // this avoids TimecontrolString and SpeedString being frozen on the same value independently 
            // from what user chooses, e.g. stuck on "fischer" and "blitz"

            // for fischer, byoyomi, or canadian, we use our UHMAEAT for maintimes !
            // simple time is not included in reject messages for maintime : no main time, only period time !

            /* here is a list of all properties used for maintime rejects : 
            MinimumMaximumSentence    - minimum/maximum
            TimecontrolSentence       - main time - initial time and/or max time, etc..
            SpeedSentence             - for blitz/live/corr
            RankedUnrankedGamesIs     - (+/-ranked/unranked) games is
            TimeNumber                - for example 600 (600 seconds)
            TimeToString              - for example "10 minutes"  = timespanToDisplayString(config.xxx)
            TimeNotificationToString  - for example user wanted "1 seconds" = timespanToDisplayString(t.xxx)
            IncreaseDecreaseSentence  - , please increase/decrease
                                        main time - TimecontrolSentence again
            EndingSentence            - optional, currently only a "."
            ConnBelowAboveSentence    - for conn_log : below/above
            ConnSentence              - for conn_log sentence
            TimecontrolString         - "fischer" , "simple", "byoyomi" , "canadian" , "absolute"
            SpeedString               - "blitz" , "live" , "corr"
            */

            /////////////////////////////////////////////////////////////////////////////////////
            // before starting, general information : 
            // 0) "none" doesnt have a period time, so we let it slide from both maintime and 
            // periodtime rejects
            // (we have sanity checks just in case)
            // 1) simple time doesn't have a main time, only a period time, so we let it slide 
            // from maintime rejects
            // 2) fischer : doesnt have a minperiods or maxperiods (blitz/live/corr)
            // 3) absolute doesnt have a period time, so we let it slide from periodtime rejects
            // 4) while using gedit "find and replace", make sure you dont replace
            // t.max_time to t.min_time ! (it doesnt exist !)
            //////////////////////////////////////////////////////////////////////////////////////

            // before starting, make sures : we refresh values //
            // now just before TimecontrolString is being tested, we again make sure it has the latest value
            /*"fischer", "byoyomi", "canadian", "simple", "absolute" */
            this.TimecontrolString = String(t.time_control);
            // now just before SpeedString is being tested, we again make sure it has the latest value
            /* "blitz", "live", "correspondence" */
            this.SpeedString = String(t.speed);

            // before starting, sanity checks //
            // sanity check : if not fischer, not byoyomi, not canadian, not simple, not absolute
            if ((this.TimecontrolString !== "fischer") && (this.TimecontrolString !== "byoyomi") && (this.TimecontrolString !== "canadian") && (this.TimecontrolString !== "simple") && (this.TimecontrolString !== "absolute")) {
                conn_log ("error, could not find allowed time control in " + t.time_control);
                return { reject : true, msg: "error, could not find allowed time control in " + t.timecontrol};
            }
            // sanity check : if not "blitz" , not "live" , not "correspondence"
            if ((this.SpeedString !== "blitz") && (this.SpeedString !== "live") && (this.SpeedString !== "correspondence")) {
                conn_log ("error, could not find allowed game speed in " + t.speed);
                return { reject : true, msg: "error, could not find allowed game speed in " + t.speed};
            }
            // -> then if sanity checks all pass :       

            //////////// for blitz games : "blitz" //////////////////
            // min
            if ((config.minmaintimeblitz || config.minmaintimeblitzranked || config.minmaintimeblitzunranked) && (this.SpeedString === "blitz")) {
                this.MinimumMaximumSentence = "Minimum ";
                this.SpeedSentence = "for " + this.SpeedString + " ";
                this.IncreaseDecreaseSentence = ", please increase ";
                this.ConnBelowAboveSentence = " below ";
                this.ConnSentence = user.username + " wanted" + this.MinimumMaximumSentence + " "; // example : "user wanted minimum "
                if (config.minmaintimeblitz && !config.minmaintimeblitzranked && !config.minmaintimeblitzunranked) {
                    this.TimeNumber = config.minmaintimeblitz;
                    this.TimeToString = timespanToDisplayString(config.minmaintimeblitz);
                    this.RankedUnrankedGamesIsSentence = "games is ";
                }
                if (config.minmaintimeblitzranked && notification.ranked) {
                    this.TimeNumber = config.minmaintimeblitzranked;
                    this.TimeToString = timespanToDisplayString(config.minmaintimeblitzranked);
                    this.RankedUnrankedGamesIsSentence = "ranked games is ";
                }
                if (config.minmaintimeblitzunranked && !notification.ranked) {
                    this.TimeNumber = config.minmaintimeblitzunranked;
                    this.TimeToString = timespanToDisplayString(config.minmaintimeblitzunranked);
                    this.RankedUnrankedGamesIsSentence = "unranked games is ";
                }

                if ((this.TimecontrolString === "fischer") && ((t.initial_time < this.TimeNumber) || (t.max_time < this.TimeNumber))) {
                    this.TimecontrolSentence = "Initial Time and/or Max Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.initial_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "byoyomi") && t.main_time < this.TimeNumber) {
                    this.TimecontrolSentence = "Main Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.main_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "absolute") && t.total_time < this.TimeNumber) {
                    this.TimecontrolSentence = "Total Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.total_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "canadian") && t.main_time < this.TimeNumber) {
                    this.TimecontrolSentence = "Main Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.main_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
            }

            // max
            if ((config.maxmaintimeblitz || config.maxmaintimeblitzranked || config.maxmaintimeblitzunranked) && (this.SpeedString === "blitz")) {
                this.MinimumMaximumSentence = "Maximum ";
                this.SpeedSentence = "for " + this.SpeedString + " ";
                this.IncreaseDecreaseSentence = ", please reduce ";
                this.ConnBelowAboveSentence = " above ";
                this.ConnSentence = user.username + " wanted" + this.MinimumMaximumSentence + " "; // example : "user wanted minimum "
                if (config.maxmaintimeblitz && !config.maxmaintimeblitzranked && !config.maxmaintimeblitzunranked) {
                    this.TimeNumber = config.maxmaintimeblitz;
                    this.TimeToString = timespanToDisplayString(config.maxmaintimeblitz);
                    this.RankedUnrankedGamesIsSentence = "games is ";
                }
                if (config.maxmaintimeblitzranked && notification.ranked) {
                    this.TimeNumber = config.maxmaintimeblitzranked;
                    this.TimeToString = timespanToDisplayString(config.maxmaintimeblitzranked);
                    this.RankedUnrankedGamesIsSentence = "ranked games is ";
                }
                if (config.maxmaintimeblitzunranked && !notification.ranked) {
                    this.TimeNumber = config.maxmaintimeblitzunranked;
                    this.TimeToString = timespanToDisplayString(config.maxmaintimeblitzunranked);
                    this.RankedUnrankedGamesIsSentence = "unranked games is ";
                }

                if ((this.TimecontrolString === "fischer") && ((t.initial_time > this.TimeNumber) || (t.max_time > this.TimeNumber))) {
                    this.TimecontrolSentence = "Initial Time and/or Max Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.max_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "byoyomi") && t.main_time > this.TimeNumber) {
                    this.TimecontrolSentence = "Main Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.main_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "absolute") && t.total_time > this.TimeNumber) {
                    this.TimecontrolSentence = "Total Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.total_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "canadian") && t.main_time > this.TimeNumber) {
                    this.TimecontrolSentence = "Main Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.main_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
            }      

            //////////// for live games : "live" //////////////////
            // min
            if ((config.minmaintimelive || config.minmaintimeliveranked || config.minmaintimeliveunranked) && (this.SpeedString === "live")) {
                this.MinimumMaximumSentence = "Minimum ";
                this.SpeedSentence = "for " + this.SpeedString + " ";
                this.IncreaseDecreaseSentence = ", please increase ";
                this.ConnBelowAboveSentence = " below ";
                this.ConnSentence = user.username + " wanted" + this.MinimumMaximumSentence + " "; // example : "user wanted minimum "
                if (config.minmaintimelive && !config.minmaintimeliveranked && !config.minmaintimeliveunranked) {
                    this.TimeNumber = config.minmaintimelive;
                    this.TimeToString = timespanToDisplayString(config.minmaintimelive);
                    this.RankedUnrankedGamesIsSentence = "games is ";
                }
                if (config.minmaintimeliveranked && notification.ranked) {
                    this.TimeNumber = config.minmaintimeliveranked;
                    this.TimeToString = timespanToDisplayString(config.minmaintimeliveranked);
                    this.RankedUnrankedGamesIsSentence = "ranked games is ";
                }
                if (config.minmaintimeliveunranked && !notification.ranked) {
                    this.TimeNumber = config.minmaintimeliveunranked;
                    this.TimeToString = timespanToDisplayString(config.minmaintimeliveunranked);
                    this.RankedUnrankedGamesIsSentence = "unranked games is ";
                }

                if ((this.TimecontrolString === "fischer") && ((t.initial_time < this.TimeNumber) || (t.max_time < this.TimeNumber))) {
                    this.TimecontrolSentence = "Initial Time and/or Max Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.initial_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "byoyomi") && t.main_time < this.TimeNumber) {
                    this.TimecontrolSentence = "Main Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.main_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "absolute") && t.total_time < this.TimeNumber) {
                    this.TimecontrolSentence = "Total Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.total_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "canadian") && t.main_time < this.TimeNumber) {
                    this.TimecontrolSentence = "Main Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.main_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
            }

            // max
            if ((config.maxmaintimelive || config.maxmaintimeliveranked || config.maxmaintimeliveunranked) && (this.SpeedString === "live")) {
                this.MinimumMaximumSentence = "Maximum ";
                this.SpeedSentence = "for " + this.SpeedString + " ";
                this.IncreaseDecreaseSentence = ", please reduce ";
                this.ConnBelowAboveSentence = " above ";
                this.ConnSentence = user.username + " wanted" + this.MinimumMaximumSentence + " "; // example : "user wanted minimum "
                if (config.maxmaintimelive && !config.maxmaintimeliveranked && !config.maxmaintimeliveunranked) {
                    this.TimeNumber = config.maxmaintimelive;
                    this.TimeToString = timespanToDisplayString(config.maxmaintimelive);
                    this.RankedUnrankedGamesIsSentence = "games is ";
                }
                if (config.maxmaintimeliveranked && notification.ranked) {
                    this.TimeNumber = config.maxmaintimeliveranked;
                    this.TimeToString = timespanToDisplayString(config.maxmaintimeliveranked);
                    this.RankedUnrankedGamesIsSentence = "ranked games is ";
                }
                if (config.maxmaintimeliveunranked && !notification.ranked) {
                    this.TimeNumber = config.maxmaintimeliveunranked;
                    this.TimeToString = timespanToDisplayString(config.maxmaintimeliveunranked);
                    this.RankedUnrankedGamesIsSentence = "unranked games is ";
                }

                if ((this.TimecontrolString === "fischer") && ((t.initial_time > this.TimeNumber) || (t.max_time > this.TimeNumber))) {
                    this.TimecontrolSentence = "Initial Time and/or Max Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.max_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "byoyomi") && t.main_time > this.TimeNumber) {
                    this.TimecontrolSentence = "Main Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.main_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "absolute") && t.total_time > this.TimeNumber) {
                    this.TimecontrolSentence = "Total Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.total_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "canadian") && t.main_time > this.TimeNumber) {
                    this.TimecontrolSentence = "Main Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.main_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
            }

            //////////// for correspondence games : "correspondence" //////////////////
            // min
            if ((config.minmaintimecorr || config.minmaintimecorrranked || config.minmaintimecorrunranked) && (this.SpeedString === "correspondence")) {
                this.MinimumMaximumSentence = "Minimum ";
                this.SpeedSentence = "for " + this.SpeedString + " ";
                this.IncreaseDecreaseSentence = ", please increase ";
                this.ConnBelowAboveSentence = " below ";
                this.ConnSentence = user.username + " wanted" + this.MinimumMaximumSentence + " "; // example : "user wanted minimum "
                if (config.minmaintimecorr && !config.minmaintimecorrranked && !config.minmaintimecorrunranked) {
                    this.TimeNumber = config.minmaintimecorr;
                    this.TimeToString = timespanToDisplayString(config.minmaintimecorr);
                    this.RankedUnrankedGamesIsSentence = "games is ";
                }
                if (config.minmaintimecorrranked && notification.ranked) {
                    this.TimeNumber = config.minmaintimecorrranked;
                    this.TimeToString = timespanToDisplayString(config.minmaintimecorrranked);
                    this.RankedUnrankedGamesIsSentence = "ranked games is ";
                }
                if (config.minmaintimecorrunranked && !notification.ranked) {
                    this.TimeNumber = config.minmaintimecorrunranked;
                    this.TimeToString = timespanToDisplayString(config.minmaintimecorrunranked);
                    this.RankedUnrankedGamesIsSentence = "unranked games is ";
                }

                if ((this.TimecontrolString === "fischer") && ((t.initial_time < this.TimeNumber) || (t.max_time < this.TimeNumber))) {
                    this.TimecontrolSentence = "Initial Time and/or Max Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.initial_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "byoyomi") && t.main_time < this.TimeNumber) {
                    this.TimecontrolSentence = "Main Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.main_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "absolute") && t.total_time < this.TimeNumber) {
                    this.TimecontrolSentence = "Total Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.total_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "canadian") && t.main_time < this.TimeNumber) {
                    this.TimecontrolSentence = "Main Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.main_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
            }

            // max
            if ((config.maxmaintimecorr || config.maxmaintimecorrranked || config.maxmaintimecorrunranked) && (this.SpeedString === "correspondence")) {
                this.MinimumMaximumSentence = "Maximum ";
                this.SpeedSentence = "for " + this.SpeedString + " ";
                this.IncreaseDecreaseSentence = ", please reduce ";
                this.ConnBelowAboveSentence = " above ";
                this.ConnSentence = user.username + " wanted" + this.MinimumMaximumSentence + " "; // example : "user wanted minimum "
                if (config.maxmaintimecorr && !config.maxmaintimecorrranked && !config.maxmaintimecorrunranked) {
                    this.TimeNumber = config.maxmaintimecorr;
                    this.TimeToString = timespanToDisplayString(config.maxmaintimecorr);
                    this.RankedUnrankedGamesIsSentence = "games is ";
                }
                if (config.maxmaintimecorrranked && notification.ranked) {
                    this.TimeNumber = config.maxmaintimecorrranked;
                    this.TimeToString = timespanToDisplayString(config.maxmaintimecorrranked);
                    this.RankedUnrankedGamesIsSentence = "ranked games is ";
                }
                if (config.maxmaintimecorrunranked && !notification.ranked) {
                    this.TimeNumber = config.maxmaintimecorrunranked;
                    this.TimeToString = timespanToDisplayString(config.maxmaintimecorrunranked);
                    this.RankedUnrankedGamesIsSentence = "unranked games is ";
                }

                if ((this.TimecontrolString === "fischer") && ((t.initial_time > this.TimeNumber) || (t.max_time > this.TimeNumber))) {
                    this.TimecontrolSentence = "Initial Time and/or Max Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.max_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "byoyomi") && t.main_time > this.TimeNumber) {
                    this.TimecontrolSentence = "Main Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.main_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "absolute") && t.total_time > this.TimeNumber) {
                    this.TimecontrolSentence = "Total Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.total_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "canadian") && t.main_time > this.TimeNumber) {
                    this.TimecontrolSentence = "Main Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.main_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "main time 5 seconds, it is below minimum main time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
            }
        }
        ///// version 2.3 for maintimes
        ////// end of *** UHMAEAT v2.3 : Universal Highly Modulable And Expandable Argv Tree ***

        if (config.minperiodsblitz && (t.periods < config.minperiodsblitz) && t.speed === "blitz" && !config.minperiodsblitzranked && !config.minperiodsblitzunranked) {
            minmaxPeriodsBlitzlivecorrFamilyReject("minperiodsblitz");
        }
        if (config.minperiodsblitzranked && (t.periods < config.minperiodsblitzranked) && t.speed === "blitz" && notification.ranked) {
            minmaxPeriodsBlitzlivecorrFamilyReject("minperiodsblitzranked");
        }
        if (config.minperiodsblitzunranked && (t.periods < config.minperiodsblitzunranked) && t.speed === "blitz" && !notification.ranked) {
            minmaxPeriodsBlitzlivecorrFamilyReject("minperiodsblitzunranked");
        }

        if (config.minperiodslive && (t.periods < config.minperiodslive) && t.speed === "live" && !config.minperiodsliveranked && !config.minperiodsliveunranked) {
            minmaxPeriodsBlitzlivecorrFamilyReject("minperiodslive");
        }
        if (config.minperiodsliveranked && (t.periods < config.minperiodsliveranked) && t.speed === "live" && notification.ranked) {
            minmaxPeriodsBlitzlivecorrFamilyReject("minperiodsliveranked");
        }
        if (config.minperiodsliveunranked && (t.periods < config.minperiodsliveunranked) && t.speed === "live" && !notification.ranked) {
            minmaxPeriodsBlitzlivecorrFamilyReject("minperiodsliveunranked");
        }
        if (config.minperiodscorr && (t.periods < config.minperiodscorr) && t.speed === "correspondence" && !config.minperiodscorrranked && !config.minperiodscorrunranked) {
            minmaxPeriodsBlitzlivecorrFamilyReject("minperiodscorr");
        }

        if (config.minperiodscorrranked && (t.periods < config.minperiodscorrranked) && t.speed === "correspondence" && notification.ranked) {
            minmaxPeriodsBlitzlivecorrFamilyReject("minperiodscorrranked");
        }
        if (config.minperiodscorrunranked && (t.periods < config.minperiodscorrunranked) && t.speed === "correspondence" && !notification.ranked) {
            minmaxPeriodsBlitzlivecorrFamilyReject("minperiodscorrunranked");
        }
        if (config.maxperiodsblitz && (t.periods > config.maxperiodsblitz) && t.speed === "blitz" && !config.maxperiodsblitzranked && !config.maxperiodsblitzunranked) {
            minmaxPeriodsBlitzlivecorrFamilyReject("maxperiodsblitz");
        }
        if (config.maxperiodsblitzranked && (t.periods > config.maxperiodsblitzranked) && t.speed === "blitz" && notification.ranked) {
            minmaxPeriodsBlitzlivecorrFamilyReject("maxperiodsblitzranked");
        }
        if (config.maxperiodsblitzunranked && (t.periods > config.maxperiodsblitzunranked) && t.speed === "blitz" && !notification.ranked) {
            minmaxPeriodsBlitzlivecorrFamilyReject("maxperiodsblitzunranked");
        }

        if (config.maxperiodslive && (t.periods > config.maxperiodslive) && t.speed === "live" && !config.maxperiodsliveranked && !config.maxperiodsliveunranked) {
            minmaxPeriodsBlitzlivecorrFamilyReject("maxperiodslive");
        }
        if (config.maxperiodsliveranked && (t.periods > config.maxperiodsliveranked) && t.speed === "live" && notification.ranked) {
            minmaxPeriodsBlitzlivecorrFamilyReject("maxperiodsliveranked");
        }
        if (config.maxperiodsliveunranked && (t.periods > config.maxperiodsliveunranked) && t.speed === "live" && !notification.ranked) {
            minmaxPeriodsBlitzlivecorrFamilyReject("maxperiodsliveunranked");
        }

        if (config.maxperiodscorr && (t.periods > config.maxperiodscorr) && t.speed === "correspondence" && !config.maxperiodscorrranked && !config.maxperiodscorrunranked) {
            minmaxPeriodsBlitzlivecorrFamilyReject("maxperiodscorr");
        }
        if (config.maxperiodscorrranked && (t.periods > config.maxperiodscorrranked) && t.speed === "correspondence" && notification.ranked) {
            minmaxPeriodsBlitzlivecorrFamilyReject("maxperiodscorrranked");
        }
        if (config.maxperiodscorrunranked && (t.periods > config.maxperiodscorrunranked) && t.speed === "correspondence" && !notification.ranked) {
            minmaxPeriodsBlitzlivecorrFamilyReject("maxperiodscorrunranked");
        }

        ////// begining of *** UHMAEAT v2.3: Universal Highly Modulable And Expandable Argv Tree ***
        ///// version 2.3 for periodtimes
        if (config.minperiodtimeblitz || config.minperiodtimeblitzranked || config.minperiodtimeblitzunranked || config.maxperiodtimeblitz || config.maxperiodtimeblitzranked || config.maxperiodtimeblitzunranked || config.minperiodtimelive || config.minperiodtimeliveranked || config.minperiodtimeliveunranked || config.maxperiodtimelive || config.maxperiodtimeliveranked || config.maxperiodtimeliveunranked || config.minperiodtimecorr || config.minperiodtimecorrranked || config.minperiodtimecorrunranked || config.maxperiodtimecorr || config.maxperiodtimecorrranked || config.maxperiodtimecorrunranked) {
            // later the t.time_control and t.speed can't be used for rule detection for some reason,
            // so storing them now in strings while we can
            // also, whenever before TimecontrolString and SpeedString are going to be tested,
            // we always make sure they have the latest refreshed value
            // this avoids TimecontrolString and SpeedString being frozen on the same value independently 
            // from what user chooses, e.g. stuck on "fischer" and "blitz"

            // for fischer, byoyomi, or canadian, we use our UHMAEAT for periodtimes !
            // simple time is not included in reject messages for periodtime : no period time, only period time !

            /* here is a list of all properties used for periodtime rejects :
            MinimumMaximumSentence   - minimum/maximum
            TimecontrolSentence      - period time, period time for X stones, increment time, etc..
            SpeedSentence            - for blitz/live/corr
            RankedUnrankedGamesIs    - (+/-ranked/unranked) games is
            TimeNumber               - for example 600 (600 seconds)
            TimeToString             - for example "10 minutes"  = timespanToDisplayString(config.xxx)
            TimeNotificationToString - for example user wanted "1 seconds" = timespanToDisplayString(t.xxx)
            IncreaseDecreaseSentence - , please increase/decrease
                                       period time - TimecontrolSentence again
            EndingSentence           - optional, currently only a "."
            ConnBelowAboveSentence   - for conn_log : below/above
            ConnSentence             - for conn_log sentence
            TimecontrolString        - "fischer" , "simple", "byoyomi" , "canadian" , "absolute"
            SpeedString              - "blitz" , "live" , "corr"
            */

            /////////////////////////////////////////////////////////////////////////////////////
            // before starting, general information : 
            // 0) "none" doesnt have a period time, so we let it slide from both maintime and 
            // periodtime rejects
            // (we have sanity checks just in case)
            // 1) simple time doesn't have a main time, only a period time, so we let it slide 
            // from maintime rejects
            // 2) fischer : doesnt have a minperiods or maxperiods (blitz/live/corr)
            // 3) absolute doesnt have a period time, so we let it slide from periodtime rejects
            // 4) while using gedit "find and replace", make sure you dont replace
            // t.max_time to t.min_time ! (it doesnt exist !)
            //////////////////////////////////////////////////////////////////////////////////////

            // before starting, make sures : we refresh values //
            // now just before TimecontrolString is being tested, we again make sure it has the latest value
            /*"fischer", "byoyomi", "canadian", "simple", "absolute" */
            this.TimecontrolString = String(t.time_control);
            // now just before SpeedString is being tested, we again make sure it has the latest value
            /* "blitz", "live", "correspondence" */
            this.SpeedString = String(t.speed);

            // before starting, sanity checks //
            // sanity check : if not fischer, not byoyomi, not canadian, not simple, not absolute
            if ((this.TimecontrolString !== "fischer") && (this.TimecontrolString !== "byoyomi") && (this.TimecontrolString !== "canadian") && (this.TimecontrolString !== "simple") && (this.TimecontrolString !== "absolute")) {
                conn_log ("error, could not find allowed time control in " + t.time_control);
                return { reject : true, msg: "error, could not find allowed time control in " + t.timecontrol};
            }
            // sanity check : if not "blitz" , not "live" , not "correspondence"
            if ((this.SpeedString !== "blitz") && (this.SpeedString !== "live") && (this.SpeedString !== "correspondence")) {
                conn_log ("error, could not find allowed game speed in " + t.speed);
                return { reject : true, msg: "error, could not find allowed game speed in " + t.speed};
            }
            // -> then if sanity checks all pass :      

            //////////// for blitz games : "blitz" //////////////////
            // min
            if ((config.minperiodtimeblitz || config.minperiodtimeblitzranked || config.minperiodtimeblitzunranked) && (this.SpeedString === "blitz")) {
                this.MinimumMaximumSentence = "Minimum ";
                this.SpeedSentence = "for " + this.SpeedString + " ";
                this.IncreaseDecreaseSentence = ", please increase ";
                this.ConnBelowAboveSentence = " below ";
                this.ConnSentence = user.username + " wanted" + this.MinimumMaximumSentence + " "; // example : "user wanted minimum "
                if (config.minperiodtimeblitz && !config.minperiodtimeblitzranked && !config.minperiodtimeblitzunranked) {
                    this.TimeNumber = config.minperiodtimeblitz;
                    this.TimeToString = timespanToDisplayString(config.minperiodtimeblitz);
                    this.RankedUnrankedGamesIsSentence = "games is ";
                }
                if (config.minperiodtimeblitzranked && notification.ranked) {
                    this.TimeNumber = config.minperiodtimeblitzranked;
                    this.TimeToString = timespanToDisplayString(config.minperiodtimeblitzranked);
                    this.RankedUnrankedGamesIsSentence = "ranked games is ";
                }
                if (config.minperiodtimeblitzunranked && !notification.ranked) {
                    this.TimeNumber = config.minperiodtimeblitzunranked;
                    this.TimeToString = timespanToDisplayString(config.minperiodtimeblitzunranked);
                    this.RankedUnrankedGamesIsSentence = "unranked games is ";
                }

                if ((this.TimecontrolString === "fischer") && (t.time_increment < this.TimeNumber)) {
                    this.TimecontrolSentence = "Increment Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.total_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "period time 5 seconds, it is below minimum period time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "simple") && (t.per_move < this.TimeNumber)) {
                    this.TimecontrolSentence = "Time per move ";
                    this.TimeNotificationToString = timespanToDisplayString(t.per_move);
                    this.EndingSentence = ".";
                    // example : connSentence + "period time 5 seconds, it is below minimum period time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "byoyomi") && t.period_time < this.TimeNumber) {
                    this.TimecontrolSentence = "Period Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.period_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "period time 5 seconds, it is below minimum period time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "canadian") && ((t.period_time / t.stones_per_period) < this.TimeNumber)) {
                    this.TimecontrolSentence = "Period Time for all the " + t.stones_per_period + " stones ";

                    // note 1 : for canadian we add a small explanation how to understand period for all stones //
                    // note 2 : canadian period time is already for n number of stones, dont divide by stone
                    // e.g. 300 seconds divided by 25 stones = 300 / 25 = 12 seconds / stone average
                    // same as 300 seconds for all the 25 stones"

                    // then, for canadian, we need to do a conversion of TimeNumber to TimeNumber * t.stones_per_period
                    // e.g. 30 seconds period time for 1 stone (japanese byoyomi) 
                    // = 30*20 = 600 = 10 minutes period time for 20 stones
                    this.TimeNumber = (this.TimeNumber * t.stones_per_period);

                    // because of this conversion, we need to recalculate TimeToString
                    // specific to canadian (time in human readable)
                    this.TimeToString = timespanToDisplayString(this.TimeNumber);
                    // but in conn_log, we display requested time by user for all the stones
                    // example : user "wanted 5 minutes period time for all the 25 stones"
                    this.TimeNotificationToString = timespanToDisplayString(t.period_time);
                    this.EndingSentence = ".";

                    // then we can finally have a modified reject message for canadian period time
                    // example : connSentence + "period time 5 seconds, it is below minimum period time for all the n stones live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    // example : "minimum periodtime for all the 25 stones for live ranked games is 5 minutes, please increase periodtime for all the 25 stones."
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString}, ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
            }

            // max
            if ((config.maxperiodtimeblitz || config.maxperiodtimeblitzranked || config.maxperiodtimeblitzunranked) && (this.SpeedString === "blitz")) {
                this.MinimumMaximumSentence = "Maximum ";
                this.SpeedSentence = "for " + this.SpeedString + " ";
                this.IncreaseDecreaseSentence = ", please reduce ";
                this.ConnBelowAboveSentence = " above ";
                this.ConnSentence = user.username + " wanted" + this.MinimumMaximumSentence + " "; // example : "user wanted minimum "
                if (config.maxperiodtimeblitz && !config.maxperiodtimeblitzranked && !config.maxperiodtimeblitzunranked) {
                    this.TimeNumber = config.maxperiodtimeblitz;
                    this.TimeToString = timespanToDisplayString(config.maxperiodtimeblitz);
                    this.RankedUnrankedGamesIsSentence = "games is ";
                }
                if (config.maxperiodtimeblitzranked && notification.ranked) {
                    this.TimeNumber = config.maxperiodtimeblitzranked;
                    this.TimeToString = timespanToDisplayString(config.maxperiodtimeblitzranked);
                    this.RankedUnrankedGamesIsSentence = "ranked games is ";
                }
                if (config.maxperiodtimeblitzunranked && !notification.ranked) {
                    this.TimeNumber = config.maxperiodtimeblitzunranked;
                    this.TimeToString = timespanToDisplayString(config.maxperiodtimeblitzunranked);
                    this.RankedUnrankedGamesIsSentence = "unranked games is ";
                }

                if ((this.TimecontrolString === "fischer") && (t.time_increment > this.TimeNumber)) {
                    this.TimecontrolSentence = "Increment Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.time_increment);
                    this.EndingSentence = ".";
                    // example : connSentence + "period time 5 seconds, it is below minimum period time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "simple") && (t.per_move > this.TimeNumber)) {
                    this.TimecontrolSentence = "Time per move ";
                    this.TimeNotificationToString = timespanToDisplayString(t.per_move);
                    this.EndingSentence = ".";
                    // example : connSentence + "period time 5 seconds, it is below minimum period time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "byoyomi") && t.period_time > this.TimeNumber) {
                    this.TimecontrolSentence = "Period Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.period_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "period time 5 seconds, it is below minimum period time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "canadian") && ((t.period_time / t.stones_per_period) > this.TimeNumber)) {
                    this.TimecontrolSentence = "Period Time for all the " + t.stones_per_period + " stones ";

                    // note 1 : for canadian we add a small explanation how to understand period for all stones //
                    // note 2 : canadian period time is already for n number of stones, dont divide by stone
                    // e.g. 300 seconds divided by 25 stones = 300 / 25 = 12 seconds / stone average
                    // same as 300 seconds for all the 25 stones"

                    // then, for canadian, we need to do a conversion of TimeNumber to TimeNumber * t.stones_per_period
                    // e.g. 30 seconds period time for 1 stone (japanese byoyomi) 
                    // = 30*20 = 600 = 10 minutes period time for 20 stones
                    this.TimeNumber = (this.TimeNumber * t.stones_per_period);

                    // because of this conversion, we need to recalculate TimeToString
                    // specific to canadian (time in human readable)
                    this.TimeToString = timespanToDisplayString(this.TimeNumber);
                    // but in conn_log, we display requested time by user for all the stones
                    // example : user "wanted 5 minutes period time for all the 25 stones"
                    this.TimeNotificationToString = timespanToDisplayString(t.period_time);
                    this.EndingSentence = ".";

                    // then we can finally have a modified reject message for canadian period time
                    // example : connSentence + "period time 5 seconds, it is below minimum period time for all the n stones live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    // example : "minimum periodtime for all the 25 stones for live ranked games is 5 minutes, please increase periodtime for all the 25 stones."
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString}, ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
            }

            //////////// for live games : "live" //////////////////
            // min
            if ((config.minperiodtimelive || config.minperiodtimeliveranked || config.minperiodtimeliveunranked) && (this.SpeedString === "live")) {
                this.MinimumMaximumSentence = "Minimum ";
                this.SpeedSentence = "for " + this.SpeedString + " ";
                this.IncreaseDecreaseSentence = ", please increase ";
                this.ConnBelowAboveSentence = " below ";
                this.ConnSentence = user.username + " wanted" + this.MinimumMaximumSentence + " "; // example : "user wanted minimum "
                if (config.minperiodtimelive && !config.minperiodtimeliveranked && !config.minperiodtimeliveunranked) {
                    this.TimeNumber = config.minperiodtimelive;
                    this.TimeToString = timespanToDisplayString(config.minperiodtimelive);
                    this.RankedUnrankedGamesIsSentence = "games is ";
                }
                if (config.minperiodtimeliveranked && notification.ranked) {
                    this.TimeNumber = config.minperiodtimeliveranked;
                    this.TimeToString = timespanToDisplayString(config.minperiodtimeliveranked);
                    this.RankedUnrankedGamesIsSentence = "ranked games is ";
                }
                if (config.minperiodtimeliveunranked && !notification.ranked) {
                    this.TimeNumber = config.minperiodtimeliveunranked;
                    this.TimeToString = timespanToDisplayString(config.minperiodtimeliveunranked);
                    this.RankedUnrankedGamesIsSentence = "unranked games is ";
                }

                if ((this.TimecontrolString === "fischer") && (t.time_increment < this.TimeNumber)) {
                    this.TimecontrolSentence = "Increment Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.time_increment);
                    this.EndingSentence = ".";
                    // example : connSentence + "period time 5 seconds, it is below minimum period time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "simple") && (t.per_move < this.TimeNumber)) {
                    this.TimecontrolSentence = "Time per move ";
                    this.TimeNotificationToString = timespanToDisplayString(t.per_move);
                    this.EndingSentence = ".";
                    // example : connSentence + "period time 5 seconds, it is below minimum period time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "byoyomi") && t.period_time < this.TimeNumber) {
                    this.TimecontrolSentence = "Period Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.period_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "period time 5 seconds, it is below minimum period time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "canadian") && ((t.period_time / t.stones_per_period) < this.TimeNumber)) {
                    this.TimecontrolSentence = "Period Time for all the " + t.stones_per_period + " stones ";

                    // note 1 : for canadian we add a small explanation how to understand period for all stones //
                    // note 2 : canadian period time is already for n number of stones, dont divide by stone
                    // e.g. 300 seconds divided by 25 stones = 300 / 25 = 12 seconds / stone average
                    // same as 300 seconds for all the 25 stones"

                    // then, for canadian, we need to do a conversion of TimeNumber to TimeNumber * t.stones_per_period
                    // e.g. 30 seconds period time for 1 stone (japanese byoyomi) 
                    // = 30*20 = 600 = 10 minutes period time for 20 stones
                    this.TimeNumber = (this.TimeNumber * t.stones_per_period);

                    // because of this conversion, we need to recalculate TimeToString
                    // specific to canadian (time in human readable)
                    this.TimeToString = timespanToDisplayString(this.TimeNumber);
                    // but in conn_log, we display requested time by user for all the stones
                    // example : user "wanted 5 minutes period time for all the 25 stones"
                    this.TimeNotificationToString = timespanToDisplayString(t.period_time);
                    this.EndingSentence = ".";

                    // then we can finally have a modified reject message for canadian period time
                    // example : connSentence + "period time 5 seconds, it is below minimum period time for all the n stones live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    // example : "minimum periodtime for all the 25 stones for live ranked games is 5 minutes, please increase periodtime for all the 25 stones."
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString}, ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
            }

            // max
            if ((config.maxperiodtimelive || config.maxperiodtimeliveranked || config.maxperiodtimeliveunranked) && (this.SpeedString === "live")) {
                this.MinimumMaximumSentence = "Maximum ";
                this.SpeedSentence = "for " + this.SpeedString + " ";
                this.IncreaseDecreaseSentence = ", please reduce ";
                this.ConnBelowAboveSentence = " above ";
                this.ConnSentence = user.username + " wanted" + this.MinimumMaximumSentence + " "; // example : "user wanted minimum "
                if (config.maxperiodtimelive && !config.maxperiodtimeliveranked && !config.maxperiodtimeliveunranked) {
                    this.TimeNumber = config.maxperiodtimelive;
                    this.TimeToString = timespanToDisplayString(config.maxperiodtimelive);
                    this.RankedUnrankedGamesIsSentence = "games is ";
                }
                if (config.maxperiodtimeliveranked && notification.ranked) {
                    this.TimeNumber = config.maxperiodtimeliveranked;
                    this.TimeToString = timespanToDisplayString(config.maxperiodtimeliveranked);
                    this.RankedUnrankedGamesIsSentence = "ranked games is ";
                }
                if (config.maxperiodtimeliveunranked && !notification.ranked) {
                    this.TimeNumber = config.maxperiodtimeliveunranked;
                    this.TimeToString = timespanToDisplayString(config.maxperiodtimeliveunranked);
                    this.RankedUnrankedGamesIsSentence = "unranked games is ";
                }

                if ((this.TimecontrolString === "fischer") && (t.time_increment > this.TimeNumber)) {
                    this.TimecontrolSentence = "Increment Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.time_increment);
                    this.EndingSentence = ".";
                    // example : connSentence + "period time 5 seconds, it is below minimum period time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "simple") && (t.per_move > this.TimeNumber)) {
                    this.TimecontrolSentence = "Time per move ";
                    this.TimeNotificationToString = timespanToDisplayString(t.per_move);
                    this.EndingSentence = ".";
                    // example : connSentence + "period time 5 seconds, it is below minimum period time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "byoyomi") && t.period_time > this.TimeNumber) {
                    this.TimecontrolSentence = "Period Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.period_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "period time 5 seconds, it is below minimum period time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "canadian") && ((t.period_time / t.stones_per_period) > this.TimeNumber)) {
                    this.TimecontrolSentence = "Period Time for all the " + t.stones_per_period + " stones ";

                    // note 1 : for canadian we add a small explanation how to understand period for all stones //
                    // note 2 : canadian period time is already for n number of stones, dont divide by stone
                    // e.g. 300 seconds divided by 25 stones = 300 / 25 = 12 seconds / stone average
                    // same as 300 seconds for all the 25 stones"

                    // then, for canadian, we need to do a conversion of TimeNumber to TimeNumber * t.stones_per_period
                    // e.g. 30 seconds period time for 1 stone (japanese byoyomi) 
                    // = 30*20 = 600 = 10 minutes period time for 20 stones
                    this.TimeNumber = (this.TimeNumber * t.stones_per_period);

                    // because of this conversion, we need to recalculate TimeToString
                    // specific to canadian (time in human readable)
                    this.TimeToString = timespanToDisplayString(this.TimeNumber);
                    // but in conn_log, we display requested time by user for all the stones
                    // example : user "wanted 5 minutes period time for all the 25 stones"
                    this.TimeNotificationToString = timespanToDisplayString(t.period_time);
                    this.EndingSentence = ".";

                    // then we can finally have a modified reject message for canadian period time
                    // example : connSentence + "period time 5 seconds, it is below minimum period time for all the n stones live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    // example : "minimum periodtime for all the 25 stones for live ranked games is 5 minutes, please increase periodtime for all the 25 stones."
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString}, ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
            }

            //////////// for corr games : "correspondence" //////////////////
            // min
            if ((config.minperiodtimecorr || config.minperiodtimecorrranked || config.minperiodtimecorrunranked) && (this.SpeedString === "correspondence")) {
                this.MinimumMaximumSentence = "Minimum ";
                this.SpeedSentence = "for " + this.SpeedString + " ";
                this.IncreaseDecreaseSentence = ", please increase ";
                this.ConnBelowAboveSentence = " below ";
                this.ConnSentence = user.username + " wanted" + this.MinimumMaximumSentence + " "; // example : "user wanted minimum "
                if (config.minperiodtimecorr && !config.minperiodtimecorrranked && !config.minperiodtimecorrunranked) {
                    this.TimeNumber = config.minperiodtimecorr;
                    this.TimeToString = timespanToDisplayString(config.minperiodtimecorr);
                    this.RankedUnrankedGamesIsSentence = "games is ";
                }
                if (config.minperiodtimecorrranked && notification.ranked) {
                    this.TimeNumber = config.minperiodtimecorrranked;
                    this.TimeToString = timespanToDisplayString(config.minperiodtimecorrranked);
                    this.RankedUnrankedGamesIsSentence = "ranked games is ";
                }
                if (config.minperiodtimecorrunranked && !notification.ranked) {
                    this.TimeNumber = config.minperiodtimecorrunranked;
                    this.TimeToString = timespanToDisplayString(config.minperiodtimecorrunranked);
                    this.RankedUnrankedGamesIsSentence = "unranked games is ";
                }

                if ((this.TimecontrolString === "fischer") && (t.time_increment < this.TimeNumber)) {
                    this.TimecontrolSentence = "Increment Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.time_increment);
                    this.EndingSentence = ".";
                    // example : connSentence + "period time 5 seconds, it is below minimum period time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "simple") && (t.per_move < this.TimeNumber)) {
                    this.TimecontrolSentence = "Time per move ";
                    this.TimeNotificationToString = timespanToDisplayString(t.per_move);
                    this.EndingSentence = ".";
                    // example : connSentence + "period time 5 seconds, it is below minimum period time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "byoyomi") && t.period_time < this.TimeNumber) {
                    this.TimecontrolSentence = "Period Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.period_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "period time 5 seconds, it is below minimum period time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "canadian") && ((t.period_time / t.stones_per_period) < this.TimeNumber)) {
                    this.TimecontrolSentence = "Period Time for all the " + t.stones_per_period + " stones ";

                    // note 1 : for canadian we add a small explanation how to understand period for all stones //
                    // note 2 : canadian period time is already for n number of stones, dont divide by stone
                    // e.g. 300 seconds divided by 25 stones = 300 / 25 = 12 seconds / stone average
                    // same as 300 seconds for all the 25 stones"

                    // then, for canadian, we need to do a conversion of TimeNumber to TimeNumber * t.stones_per_period
                    // e.g. 30 seconds period time for 1 stone (japanese byoyomi) 
                    // = 30*20 = 600 = 10 minutes period time for 20 stones
                    this.TimeNumber = (this.TimeNumber * t.stones_per_period);

                    // because of this conversion, we need to recalculate TimeToString
                    // specific to canadian (time in human readable)
                    this.TimeToString = timespanToDisplayString(this.TimeNumber);
                    // but in conn_log, we display requested time by user for all the stones
                    // example : user "wanted 5 minutes period time for all the 25 stones"
                    this.TimeNotificationToString = timespanToDisplayString(t.period_time);
                    this.EndingSentence = ".";

                    // then we can finally have a modified reject message for canadian period time
                    // example : connSentence + "period time 5 seconds, it is below minimum period time for all the n stones live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    // example : "minimum periodtime for all the 25 stones for live ranked games is 5 minutes, please increase periodtime for all the 25 stones."
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString}, ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
            }

            // max
            if ((config.maxperiodtimecorr || config.maxperiodtimecorrranked || config.maxperiodtimecorrunranked) && (this.SpeedString === "correspondence")) {
                this.MinimumMaximumSentence = "Maximum ";
                this.SpeedSentence = "for " + this.SpeedString + " ";
                this.IncreaseDecreaseSentence = ", please reduce ";
                this.ConnBelowAboveSentence = " above ";
                this.ConnSentence = user.username + " wanted" + this.MinimumMaximumSentence + " "; // example : "user wanted minimum "
                if (config.maxperiodtimecorr && !config.maxperiodtimecorrranked && !config.maxperiodtimecorrunranked) {
                    this.TimeNumber = config.maxperiodtimecorr;
                    this.TimeToString = timespanToDisplayString(config.maxperiodtimecorr);
                    this.RankedUnrankedGamesIsSentence = "games is ";
                }
                if (config.maxperiodtimecorrranked && notification.ranked) {
                    this.TimeNumber = config.maxperiodtimecorrranked;
                    this.TimeToString = timespanToDisplayString(config.maxperiodtimecorrranked);
                    this.RankedUnrankedGamesIsSentence = "ranked games is ";
                }
                if (config.maxperiodtimecorrunranked && !notification.ranked) {
                    this.TimeNumber = config.maxperiodtimecorrunranked;
                    this.TimeToString = timespanToDisplayString(config.maxperiodtimecorrunranked);
                    this.RankedUnrankedGamesIsSentence = "unranked games is ";
                }

                if ((this.TimecontrolString === "fischer") && (t.time_increment > this.TimeNumber)) {
                    this.TimecontrolSentence = "Increment Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.time_increment);
                    this.EndingSentence = ".";
                    // example : connSentence + "period time 5 seconds, it is below minimum period time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "simple") && (t.per_move > this.TimeNumber)) {
                    this.TimecontrolSentence = "Time per move ";
                    this.TimeNotificationToString = timespanToDisplayString(t.per_move);
                    this.EndingSentence = ".";
                    // example : connSentence + "period time 5 seconds, it is below minimum period time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "byoyomi") && t.period_time > this.TimeNumber) {
                    this.TimecontrolSentence = "Period Time ";
                    this.TimeNotificationToString = timespanToDisplayString(t.period_time);
                    this.EndingSentence = ".";
                    // example : connSentence + "period time 5 seconds, it is below minimum period time live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "canadian") && ((t.period_time / t.stones_per_period) > this.TimeNumber)) {
                    this.TimecontrolSentence = "Period Time for all the " + t.stones_per_period + " stones ";

                    // note 1 : for canadian we add a small explanation how to understand period for all stones //
                    // note 2 : canadian period time is already for n number of stones, dont divide by stone
                    // e.g. 300 seconds divided by 25 stones = 300 / 25 = 12 seconds / stone average
                    // same as 300 seconds for all the 25 stones"

                    // then, for canadian, we need to do a conversion of TimeNumber to TimeNumber * t.stones_per_period
                    // e.g. 30 seconds period time for 1 stone (japanese byoyomi) 
                    // = 30*20 = 600 = 10 minutes period time for 20 stones
                    this.TimeNumber = (this.TimeNumber * t.stones_per_period);

                    // because of this conversion, we need to recalculate TimeToString
                    // specific to canadian (time in human readable)
                    this.TimeToString = timespanToDisplayString(this.TimeNumber);
                    // but in conn_log, we display requested time by user for all the stones
                    // example : user "wanted 5 minutes period time for all the 25 stones"
                    this.TimeNotificationToString = timespanToDisplayString(t.period_time);
                    this.EndingSentence = ".";

                    // then we can finally have a modified reject message for canadian period time
                    // example : connSentence + "period time 5 seconds, it is below minimum period time for all the n stones live in byoyomi : 1 minutes"
                    conn_log(this.ConnSentence + this.TimecontrolSentence + this.TimeNotificationToString + ", it is" + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence + this.SpeedString + " in " + this.TimecontrolString);
                    // example : "minimum periodtime for all the 25 stones for live ranked games is 5 minutes, please increase periodtime for all the 25 stones."
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.TimeToString}, ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
            }
        }
        ///// version 2.3 for periodtimes
        ////// end of *** UHMAEAT v2.3 : Universal Highly Modulable And Expandable Argv Tree ***
        return { reject: false };  // Ok !

        function minmaxHandicapFamilyReject(argNameString) {
            // first, we define rankedUnranked and minMax depending on argNameString
            let rankedUnranked = "";
            // if argNameString does not include "ranked" or "unranked", we keep default value for rankedunranked
            if (argNameString.includes("ranked") && !argNameString.includes("unranked")) {
                rankedUnranked = "for ranked games";
            } else if (argNameString.includes("unranked")) {
                rankedUnranked = "for unranked games";
            }

            let minMax = "";
            let increaseDecrease = "";
            if (argNameString.includes("min")) {
                minMax = "Min";
                increaseDecrease = "increase";
            } else if (argNameString.includes("max")) {
                minMax = "Max";
                increaseDecrease = "reduce";
            }

            // then, specific messages for handicaponly and evenonly messages first
            if (notification.handicap === 0 && minMax === "Min" && config[argNameString] > 0) {
                conn_log(`handicap games only ${rankedUnranked}`);
                return { reject: true, msg: `this bot does not play even games ${rankedUnranked}, please manually select the number of handicap stones in -custom handicap- : minimum is ${config[argNameString]} handicap stones or more` };
            } else if (notification.handicap > 0 && minMax === "Max" && config[argNameString] === 0) {
                conn_log(`even games only ${rankedUnranked}`);
                return { reject: true, msg: `this bot does not play handicap games ${rankedUnranked}, please choose handicap -none- (0 handicap stones)` };

            // then finally, the actual reject :
            } else {
                conn_log(`${minMax} handicap ${rankedUnranked} is ${config[argNameString]}`);
                return { reject: true, msg: `${minMax} handicap ${rankedUnranked} is ${config[argNameString]}, please ${increaseDecrease} the number of handicap stones` };
            }
        }

        function minmaxPeriodsBlitzlivecorrFamilyReject(argNameString) {
            // first, we define blitzLiveCorr, rankedUnranked, minMax, increaseDecrease, depending on argNameString
            let blitzLiveCorr = "";
            if (argNameString.includes("blitz")) {
                blitzLiveCorr = "blitz";
            } else if (argNameString.includes("live")) {
                blitzLiveCorr = "live";
            } else if (argNameString.includes("corr")) {
                blitzLiveCorr = "correspondence";
            }

            let rankedUnranked = "";
            if (!argNameString.includes("ranked")) {
                // here we keep the general argument line unlike other functions, 
                // because it has a specific message like for example "for blitz games"
                rankedUnranked = `for ${blitzLiveCorr} games`;
            } else if (argNameString.includes("ranked") && !argNameString.includes("unranked")) {
                rankedUnranked = `for ${blitzLiveCorr} ranked games`;
            } else if (argNameString.includes("unranked")) {
                rankedUnranked = `for ${blitzLiveCorr} unranked games`;
            }

            let minMax = "";
            let increaseDecrease = "";
            if (argNameString.includes("min")) {
                minMax = "Min";
                increaseDecrease = "increase";
            } else if (argNameString.includes("max")) {
                minMax = "Max";
                increaseDecrease = "reduce";
            }

            // then finally, the actual reject :
            conn_log(`${user.username} wanted ${t.periods} periods, ${minMax} periods ${rankedUnranked} is ${config[argNameString]}, needs to be ${increaseDecrease}d`);
            return { reject: true, msg: `${minMax} periods ${rankedUnranked} is ${config[argNameString]}, please ${increaseDecrease} the number of periods` };
        }

        function automaticHandicapStoneDetectionReject (argNameString) {
            // first, we define rankedUnranked and minMax depending on argNameString
            let rankedUnranked = "";
            // if argNameString does not include "ranked" or "unranked", we keep default value for rankedunranked
            if (argNameString.includes("ranked") && !argNameString.includes("unranked")) {
                rankedUnranked = "for ranked games";
            } else if (argNameString.includes("unranked")) {
                rankedUnranked = "for unranked games";
            }

            let minMax = "";
            let increaseDecrease = "";
            if (argNameString.includes("min")) {
                minMax = "Min";
                increaseDecrease = "increase";
            } else if (argNameString.includes("max")) {
                minMax = "Max";
                increaseDecrease = "reduce";
            }

            // then finally, the actual reject :
            conn_log(`Automatic handicap ${rankedUnranked} was set to ${rankDifference} stones, but ${minMax} handicap ${rankedUnranked} is ${config[argNameString]} stones`);
            return { reject: true, msg: `Your automatic handicap ${rankedUnranked} was automatically set to ${rankDifference} stones based on rank difference between you and this bot,\nBut ${minMax} handicap ${rankedUnranked} is ${config[argNameString]} stones \nPlease ${increaseDecrease} the number of handicap stones ${rankedUnranked} in -custom handicap-` };
        }

        function pluralFamilyStringToSingularString(plural) {
            let pluralToConvert = plural.split("unranked")[0].split("ranked")[0].split("");
                // for example "speedsranked" -> ["s", "p", "e", "e", "d", "s"]
            pluralToConvert.pop();
                // for example ["s", "p", "e", "e", "d", "s"] -> ["s", "p", "e", "e", "d"]
            pluralToConvert = pluralToConvert.join("");
                // for example ["s", "p", "e", "e", "d"] -> "speed"
            return pluralToConvert;
        }

        function genericAllowedFamiliesReject(argNameString, notificationUnit) {
            // first, we define rankedUnranked, argFamilySingularString, depending on argNameString

            let rankedUnranked = "";
            // if argNameString does not include "ranked" or "unranked", we keep default value for rankedunranked
            if (argNameString.includes("ranked") && !argNameString.includes("unranked")) {
                rankedUnranked = "for ranked games ";
            } else if (argNameString.includes("unranked")) {
                rankedUnranked = "for unranked games ";
            }

            let argFamilySingularString = pluralFamilyStringToSingularString(argNameString);
            // for example "speedsranked" -> "speed"

            // then, we process the inputs to human readable, 
            let argConverted = argNameString;
            let notificationUnitConverted = notificationUnit;
            // if argFamilySingularString family is "boardsize" type :
            if (argFamilySingularString.includes("boardsize")) {
                argConverted = boardsizeSquareToDisplayString(config[argNameString]);
                notificationUnitConverted = boardsizeSquareToDisplayString(notificationUnit);
            }
            // if argFamilySingularString family is "komi" type :
            if (argFamilySingularString.includes("komi")) {
                if (notificationUnit === null) {
                    notificationUnitConverted = "automatic";
                }
            }
            // else we dont dont convert : we dont change anything

            // then finally, the actual reject :
            conn_log(`${user.username} wanted ${argFamilySingularString} ${rankedUnranked}-${notificationUnitConverted}-, not in -${config[argConverted]}- `);
            // for example : "user wanted speed for ranked games -blitz-, not in -live,correspondence-
            return { reject: true, msg: `${argFamilySingularString} -${notificationUnitConverted}- is not allowed on this bot ${rankedUnranked}, please choose one of these allowed ${argFamilySingularString}s ${rankedUnranked} : -${config[argConverted]}-` };
            /* for example : "speed -blitz- is not allowed on this bot for ranked games, please
                             choose one of these allowed speeds for ranked games : 
                             -live,correspondence-"
            */
        }

    } /* }}} */
    // Check everything and return reject status + optional error msg.
    //
    checkChallenge(notification) { /* {{{ */
        if (config.check_rejectnew()) {
            conn_log("Not accepting new games (rejectnew).");
            return { reject: true, msg: config.REJECTNEWMSG };
        }

        let c = this.checkUser(notification);
        if (c.reject)  return c;

        c = this.checkGameSettings(notification);
        if (c.reject)  return c;

        return { reject: false };  /* All good. */

    } /* }}} */
    on_challenge(notification) { /* {{{ */
        let c = this.checkChallenge(notification);
        let rejectmsg = (c.msg ? c.msg : "");

        let handi = (notification.handicap > 0 ? "H" + notification.handicap : "");
        let accepting = (c.reject ? "Rejecting" : "Accepting");
        conn_log(sprintf("%s challenge from %s (%s)  [%ix%i] %s id = %i",
                         accepting, notification.user.username, rankToString(notification.user.ranking),
                         notification.width, notification.width,
                         handi, notification.game_id));

        if (!c.reject) {
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

function rankToString(r) { /* {{{ */
    r = Math.floor(r);
    if (r >= 30)  return (r-30+1) + 'd'; // r>=30 : 1 dan or stronger
    else          return (30-r) + 'k'; // r<30 : 1 kyu or weaker
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
    .split(',')
    .map(e => e.trim())
    .map(e => `${e}x${e}`)
    .join(', ');
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
            console.debug(method, host, port, path, data);
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
