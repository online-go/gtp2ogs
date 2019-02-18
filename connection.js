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
            this.idle_game_timeout_interval = setInterval(
                this.disconnectIdleGames.bind(this), 1000);
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
                if (Game.corr_moves_processing == 0) {
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
            if (Game.moves_processing == 0) {
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
            if (config.timeout) {
                clearInterval(this.idle_game_timeout_interval);
            }

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
            /* if (gamedata.phase == 'stone removal'
                && ((!gamedata.black.accepted && gamedata.black.id == this.bot_id)
                ||  (!gamedata.white.accepted && gamedata.white.id == this.bot_id))
               ) {
                this.processMove(gamedata);
            } */

            // Don't connect to old finished games.
            if (gamedata.phase == "finished" && !(gamedata.id in this.connected_games))
                return;

            // Set up the game so it can listen for events.
            //
            let game = this.connectToGame(gamedata.id);

            // When a game ends, we don't get a "finished" active_game.phase. Probably since the game is no
            // longer active.(Update: We do get finished active_game events? Unclear why I added prior note.)
            //
            if (gamedata.phase == "finished") {
                if (config.DEBUG) conn_log(gamedata.id, "gamedata.phase == finished");

                // XXX We want to disconnect right away here, but there's a game over race condition
                //     on server side: sometimes /gamedata event with game outcome is sent after
                //     active_game, so it's lost since there's no game to handle it anymore...
                //     Work around it with a timeout for now.
                setTimeout(() => {  this.disconnectFromGame(gamedata.id);  }, 1000);
            }
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

        return this.connected_games[game_id] = new Game(this, game_id);;
    }; /* }}} */
    disconnectFromGame(game_id) { /* {{{ */
        if (config.DEBUG) {
            conn_log("disconnectFromGame", game_id);
        }
        if (game_id in this.connected_games) {
            this.connected_games[game_id].disconnect();
            delete this.connected_games[game_id];
        }
    }; /* }}} */
    disconnectIdleGames() {
        let now = Date.now();
        for (let game_id in this.connected_games) {
            let state = this.connected_games[game_id].state;
            if (state == null) {
                if (config.DEBUG) conn_log("No game state, not checking idle status for", game_id);
                continue;
            }
            if ((state.clock.current_player != this.bot_id) && (state.clock.last_move + config.timeout < now)) {
                if (config.DEBUG) conn_log("Disconnecting from game, other player has been idling for ", config.timeout);
                this.disconnectFromGame(game_id);
            }
        }
    };
    deleteNotification(notification) { /* {{{ */
        this.socket.emit('notification/delete', this.auth({notification_id: notification.id}), (x) => {
            conn_log("Deleted notification ", notification.id);
        });
    }; /* }}} */
    connection_reset() { /* {{{ */
        for (let game_id in this.connected_games) {
            this.disconnectFromGame(game_id);
        }
        if (this.socket) this.socket.emit('notification/connect', this.auth({}), (x) => {
            conn_log(x);
        });
    }; /* }}} */
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
        } else if (notification.ranked && (config.banned_ranked_users[user.username] || config.banned_ranked_users[user.id])) {
            conn_log(user.username + " (" + user.id + ") is banned from ranked, rejecting challenge");
            return { reject: true };
        } else if (!notification.ranked && (config.banned_unranked_users[user.username] || config.banned_unranked_users[user.id])) {
            conn_log(user.username + " (" + user.id + ") is banned from unranked, rejecting challenge");
            return { reject: true };
        }

        if (config.proonly && !user.professional) {
            conn_log(user.username + " is not a professional");
            return { reject: true, msg: "You are not a professional player, this bot accepts games vs professionals only. " };
        }

        let connected_games_per_user = this.gamesForPlayer(notification.user.id);
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
            let humanReadableUserRank = rankToString(user.ranking);
            let humanReadableMinRank = rankToString(config.minrank);
            conn_log(user.username + " ranking too low: " + humanReadableUserRank + " : min is " + humanReadableMinRank);
            return { reject: true, msg: "Minimum rank is " + humanReadableMinRank + ", your rank is too low." };
        }

        if ((user.ranking < config.minrankranked) && notification.ranked) {
            let humanReadableUserRank = rankToString(user.ranking);
            let humanReadableMinRank = rankToString(config.minrankranked);
            conn_log(user.username + " ranking too low: " + humanReadableUserRank + " : min for ranked games is " + humanReadableMinRank);
            return { reject: true, msg: "Minimum rank for ranked games is " + humanReadableMinRank + ", your rank is too low, try unranked game" };
        }

        if ((user.ranking < config.minrankunranked) && !notification.ranked) {
            let humanReadableUserRank = rankToString(user.ranking);
            let humanReadableMinRank = rankToString(config.minrankunranked);
            conn_log(user.username + " ranking too low: " + humanReadableUserRank + " : min for ranked games is " + humanReadableMinRank);
            return { reject: true, msg: "Minimum rank for unranked games is " + humanReadableMinRank + ", your rank is too low" };
        }

        if ((user.ranking > config.maxrank) && !config.maxrankranked && !config.maxrankunranked) {
            let humanReadableUserRank = rankToString(user.ranking);
            let humanReadableMaxRank = rankToString(config.maxrank);
            conn_log(user.username + " ranking too high: " + humanReadableUserRank + " : max is " + humanReadableMaxRank);
            return { reject: true, msg: "Maximum rank is " + humanReadableMaxRank + ", your rank is too high." };
        }

        if ((user.ranking > config.maxrankranked) && notification.ranked) {
            let humanReadableUserRank = rankToString(user.ranking);
            let humanReadableMaxRank = rankToString(config.maxrank);
            conn_log(user.username + " ranking too high: " + humanReadableUserRank + " : max for ranked games is " + humanReadableMaxRank);
            return { reject: true, msg: "Maximum rank for ranked games is " + humanReadableMaxRank + ", your rank is too high, try unranked game" };
        }

        if ((user.ranking > config.maxrankunranked) && !notification.ranked) {
            let humanReadableUserRank = rankToString(user.ranking);
            let humanReadableMaxRank = rankToString(config.maxrank);
            conn_log(user.username + " ranking too high: " + humanReadableUserRank + " : max for unranked games is " + humanReadableMaxRank);
            return { reject: true, msg: "Maximum rank for unranked games is " + humanReadableMaxRank + ", your rank is too high" };
        }


        return { reject: false }; // OK !

    }; /* }}} */
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

        // for all the allowed_family options below (timecontrols, speeds, komi, boardsizes) 
        // we need to add a "family guard" 
        // && config.familyranked for ranked games 
        // && config.familyunranked for unranked games
        // else the allowed_ is always false and always rejects

        /******** begining of BOARDSIZES *********/
        // for square board sizes only //
        /* if not square*/
        if (notification.width != notification.height && !config.allow_all_sizes && !config.allow_custom_sizes && !config.boardsizeranked && !config.boardsizeunranked) {
            conn_log("board was not square, not allowed");
            return { reject: true, msg: "Your selected board size " + notification.width + "x" + notification.height + " (width x height), is not square, not allowed, please choose a square board size (same width and height, for example 9x9 or 19x19). " };
        }

        if (notification.width != notification.height && !config.allow_all_sizes_ranked && !config.allow_custom_sizes_ranked && notification.ranked) {
            conn_log("board was not square, not allowed for ranked games");
            return { reject: true, msg: "Your selected board size " + notification.width + "x" + notification.height + " (width x height), is not square, not allowed for ranked games, please choose a square board size (same width and height, for example 9x9 or 19x19). " };
        }

        if (notification.width != notification.height && !config.allow_all_sizes_unranked && !config.allow_custom_sizes_unranked && !notification.ranked) {
            conn_log("board was not square, not allowed for unranked games");
            return { reject: true, msg: "Your selected board size " + notification.width + "x" + notification.height + " (width x height), is not square, not allowed for unranked games, please choose a square board size (same width and height, for example 9x9 or 19x19). " };
        }

        /* if square, check if square board size is allowed*/
        if (!config.allowed_sizes[notification.width] && !config.allow_all_sizes && !config.allow_custom_sizes && !config.boardsizeranked && !config.boardsizeunranked) {
            let boardsizeSquareString = String(config.boardsize); // we convert the value to a string to avoid undefined error later
            conn_log("square board size " + notification.width + "x" + notification.height + " is not an allowed size");
            return { reject: true, msg: "Board size " + notification.width + "x" + notification.height + " is not allowed, please choose one of these allowed board sizes " + boardsizeSquareToDisplayString(boardsizeSquareString)};
        }

        if (!config.allowed_sizes_ranked[notification.width] && !config.allow_all_sizes_ranked && !config.allow_custom_sizes_ranked && notification.ranked && config.boardsizeranked) {
            let boardsizeSquareString = String(config.boardsizeranked); // we convert the value to a string to avoid undefined error later
            conn_log("square board size " + notification.width + "x" + notification.height + " is not an allowed size for ranked games");
            return { reject: true, msg: "Board size " + notification.width + "x" + notification.height + " is not allowed for ranked games, please choose one of these allowed board sizes for ranked games : " + boardsizeSquareToDisplayString(boardsizeSquareString)};
        }

        if (!config.allowed_sizes_unranked[notification.width] && !config.allow_all_sizes_unranked && !config.allow_custom_sizes_unranked && !notification.ranked  && config.boardsizeunranked) {
            let boardsizeSquareString = String(config.boardsizeunranked); // we convert the value to a string to avoid undefined error later
            conn_log("square board size " + notification.width + "x" + notification.height + " is not an allowed size for unranked games");
            return { reject: true, msg: "Board size " + notification.width + "x" + notification.height + " is not allowed for unranked games, please choose one of these allowed board sizes for unranked games " + boardsizeSquareToDisplayString(boardsizeSquareString)};
        }

        // for custom board sizes, including square board sizes if width == height as well //
        /* if custom, check width */
        if (!config.allow_all_sizes && config.allow_custom_sizes && !config.allowed_custom_boardsizewidth[notification.width] && !config.boardsizewidthranked && !config.boardsizewidthunranked) {
            conn_log("custom board width " + notification.width + " is not an allowed custom board width");
            return { reject: true, msg: "In your selected board size " + notification.width + "x" + notification.height + " (width x height), board WIDTH (" + notification.width + ") is not allowed, please choose one of these allowed CUSTOM board WIDTH values : " + config.boardsizewidth };
        }

        if (!config.allow_all_sizes_ranked && config.allow_custom_sizes_ranked && !config.allowed_custom_boardsizewidth_ranked[notification.width] && notification.ranked && config.boardsizewidthranked) {
            conn_log("custom board width " + notification.width + " is not an allowed custom board width for ranked games");
            return { reject: true, msg: "In your selected board size " + notification.width + "x" + notification.height + " (width x height), board WIDTH (" + notification.width + ") is not allowed for ranked games, please choose one of these allowed CUSTOM board WIDTH values for ranked games : " + config.boardsizewidthranked };
        }

        if (!config.allow_all_sizes_unranked && config.allow_custom_sizes_unranked && !config.allowed_custom_boardsizewidth_unranked[notification.width] && !notification.ranked && config.boardsizewidthunranked) {
            conn_log("custom board width " + notification.width + " is not an allowed custom board width for unranked games");
            return { reject: true, msg: "In your selected board size " + notification.width + "x" + notification.height + " (width x height), board WIDTH (" + notification.width + ") is not allowed for unranked games, please choose one of these allowed CUSTOM board WIDTH values for unranked games : " + config.boardsizewidthunranked };
        }

        /* if custom, check height */
        if (!config.allow_all_sizes && config.allow_custom_sizes && !config.allowed_custom_boardsizeheight[notification.height] && !config.boardsizeheightranked && !config.boardsizeheightunranked) {
            conn_log("custom board height " + notification.height + " is not an allowed custom board height");
            return { reject: true, msg: "In your selected board size " + notification.width + "x" + notification.height + " (width x height), board HEIGHT (" + notification.height + ") is not allowed, please choose one of these allowed CUSTOM board HEIGHT values : " + config.boardsizeheight };
        }

        if (!config.allow_all_sizes && config.allow_custom_sizes && !config.allowed_custom_boardsizeheight[notification.height] && notification.ranked && config.boardsizeheightranked) {
            conn_log("custom board height " + notification.height + " is not an allowed custom board height for ranked games ");
            return { reject: true, msg: "In your selected board size " + notification.width + "x" + notification.height + " (width x height), board HEIGHT (" + notification.height + ") is not allowed for ranked games, please choose one of these allowed CUSTOM board HEIGHT values for ranked games: " + config.boardsizeheight };
        }

        if (!config.allow_all_sizes && config.allow_custom_sizes && !config.allowed_custom_boardsizeheight[notification.height] && !notification.ranked && config.boardsizeheightunranked) {
            conn_log("custom board height " + notification.height + " is not an allowed custom board height for unranked games ");
            return { reject: true, msg: "In your selected board size " + notification.width + "x" + notification.height + " (width x height), board HEIGHT (" + notification.height + ") is not allowed for unranked games, please choose one of these allowed CUSTOM board HEIGHT values for unranked games: " + config.boardsizeheight };
        }
        /******** end of BOARDSIZES *********/

        if (config.noautohandicap && notification.handicap == -1 && !config.noautohandicapranked && !config.noautohandicapunranked) {
            conn_log("no autohandicap, rejecting challenge") ;
            return { reject: true, msg: "For easier bot management, automatic handicap is disabled on this bot, please manually select the number of handicap stones you want in -custom handicap-, for example 2 handicap stones" };
	}

        if (config.noautohandicapranked && notification.handicap == -1 && notification.ranked) {
            conn_log("no autohandicap for ranked games, rejecting challenge") ;
            return { reject: true, msg: "For easier bot management, automatic handicap is disabled for ranked games on this bot, please manually select the number of handicap stones you want in -custom handicap-, for example 2 handicap stones" };
	}

        if (config.noautohandicapunranked && notification.handicap == -1 && !notification.ranked) {
            conn_log("no autohandicap for unranked games, rejecting challenge") ;
            return { reject: true, msg: "For easier bot management, automatic handicap is disabled for unranked games on this bot, please manually select the number of handicap stones you want in -custom handicap-, for example 2 handicap stones" };
	}

        if (notification.handicap < config.minhandicap && !config.minhandicapranked && !config.minhandicapunranked) {
            conn_log("Min handicap is " + config.minhandicap);
            return { reject: true, msg: "Minimum handicap is " + config.minhandicap + " , please increase the number of handicap stones " };
        }

        if (notification.handicap > config.maxhandicap && !config.maxhandicapranked && !config.maxhandicapunranked) {
            conn_log("Max handicap is " + config.maxhandicap);
            return { reject: true, msg: "Maximum handicap is " + config.maxhandicap + " , please reduce the number of handicap stones " };
        }

        if (notification.handicap < config.minhandicapranked && notification.ranked) {
            conn_log("Min handicap ranked is " + config.minhandicapranked);
            return { reject: true, msg: "Minimum handicap for ranked games is " + config.minhandicapranked + " , please increase the number of handicap stones" };
        }

        if (notification.handicap > config.maxhandicapranked && notification.ranked) {
            conn_log("Max handicap ranked is " + config.maxhandicapranked);
            return { reject: true, msg: "Maximum handicap for ranked games is " + config.maxhandicapranked + " , please reduce the number of handicap stones" };
        }

        if (notification.handicap < config.minhandicapunranked && !notification.ranked) {
            conn_log("Min handicap unranked is " + config.minhandicapunranked);
            return { reject: true, msg: "Minimum handicap for unranked games is " + config.minhandicapunranked + " , please reduce the number of handicap stones" };
        }

        if (notification.handicap > config.maxhandicapunranked && !notification.ranked) {
            conn_log("Max handicap unranked is " + config.maxhandicapunranked);
            return { reject: true, msg: "Maximum handicap for unranked games is " + config.maxhandicapunranked + " , please increase the number of handicap stones" };
        }

        if (!config.allowed_komi[notification.komi] && !config.allow_all_komi && !config.komiranked && !config.komiunranked) {
            let notificationKomiString = "";
            if (String(notification.komi) === "null") { // we need to declare this as a string or the test fails
                notificationKomiString = "automatic";
            } else {
                notificationKomiString = notification.komi;
            }
            conn_log("komi value " + notificationKomiString + " is not allowed, allowed komi are: " + config.komi);
            return { reject: true, msg: "komi " + notificationKomiString + " is not allowed, please choose one of these allowed komi : " + config.komi};
        }

        if (!config.allowed_komi_ranked[notification.komi] && notification.ranked && !config.allow_all_komi_ranked && config.komiranked) {
            let notificationKomiString = "";
            if (String(notification.komi) === "null") { // we need to declare this as a string or the test fails
                notificationKomiString = "automatic";
            } else {
                notificationKomiString = notification.komi;
            }
            conn_log("komi value " + notificationKomiString + " is not allowed for ranked games, allowed komi for ranked games are: " + config.komiranked);
            return { reject: true, msg: "komi " + notificationKomiString + " is not allowed for ranked games, please choose one of these allowed komi for ranked games: " + config.komiranked};
        }

        if (!config.allowed_komi_unranked[notification.komi] && !notification.ranked && !config.allow_all_komi_unranked && config.komiunranked) {
            let notificationKomiString = "";
            if (String(notification.komi) === "null") { // we need to declare this as a string or the test fails
                notificationKomiString = "automatic";
            } else {
                notificationKomiString = notification.komi;
            }
            conn_log("komi value " + notificationKomiString + " is not allowed for unranked games, allowed komi for unranked games are: " + config.komiunranked);
            return { reject: true, msg: "komi " + notificationKomiString + " is not allowed for unranked games, please choose one of these allowed komi for unranked games: " + config.komiunranked};
        }

        if (!config.allowed_speeds[t.speed] && !config.speedranked && !config.speedunranked) {
            conn_log(user.username + " wanted speed " + t.speed + ", not in: " + config.speed);
            return { reject: true, msg: "The " + t.speed + " game speed is not allowed on this bot, please choose one of these allowed game speeds on this bot : " + config.speed};
        }

        if (!config.allowed_speeds_ranked[t.speed] && notification.ranked && config.speedranked) {
            conn_log(user.username + " wanted speed for ranked games " + t.speed + ", not in: " + config.speedranked);
            return { reject: true, msg: "The " + t.speed + " game speed is not allowed on this bot for ranked games, please choose one of these allowed game speeds for ranked games : " + config.speedranked};
        }

        if (!config.allowed_speeds_unranked[t.speed] && !notification.ranked && config.speedunranked) {
            conn_log(user.username + " wanted speed for unranked games " + t.speed + ", not in: " + config.speedunranked);
            return { reject: true, msg: "The " + t.speed + " game speed is not allowed on this bot for unranked games, please choose one of these allowed game speeds for unranked games : " + config.speedunranked};
        }

        // note : "absolute" and/or "none" are possible, but not in defaults, see README and OPTIONS-LIST for details
        if (!config.allowed_timecontrols[t.time_control] && !config.timecontrolranked && !config.timecontrolunranked) { 
            conn_log(user.username + " wanted time control " + t.time_control + ", not in: " + config.timecontrol);
            return { reject: true, msg: "The " + t.time_control + " time control is not allowed on this bot, please choose one of these allowed time controls on this bot : " + config.timecontrol };
        }

        if (!config.allowed_timecontrols_ranked[t.time_control] && notification.ranked && config.timecontrolranked) { 
            conn_log(user.username + " wanted time control for ranked games " + t.time_control + ", not in: " + config.timecontrolranked);
            return { reject: true, msg: "The " + t.time_control + " time control is not allowed on this bot for ranked games, please choose one of these allowed time controls for ranked games : " + config.timecontrolranked };
        }

        if (!config.allowed_timecontrols_unranked[t.time_control] && !notification.ranked && config.timecontrolunranked) { 
            conn_log(user.username + " wanted time control for unranked games " + t.time_control + ", not in: " + config.timecontrolunranked);
            return { reject: true, msg: "The " + t.time_control + " time control is not allowed on this bot for unranked games, please choose one of these allowed time controls for unranked games : " + config.timecontrolunranked };
        }

        ////// begining of *** UHMAEAT v2.2: Universal Highly Modulable And Expandable Argv Tree ***
        ///// version 2.2 for maintimes
        if (config.minmaintimeblitz || config.minmaintimeblitzranked || config.minmaintimeblitzunranked || config.maxmaintimeblitz || config.maxmaintimeblitzranked || config.maxmaintimeblitzunranked || config.minmaintimelive || config.minmaintimeliveranked || config.minmaintimeliveunranked || config.maxmaintimelive || config.maxmaintimeliveranked || config.maxmaintimeliveunranked || config.minmaintimecorr || config.minmaintimecorrranked || config.minmaintimecorrunranked || config.maxmaintimecorr || config.maxmaintimecorrranked || config.maxmaintimecorrunranked) {
            // later the t.time_control and t.speed can't be used for rule detection for some reason,
            // so storing them now in strings while we can
            // also, whenever before TimecontrolString and SpeedString are going to be tested,
            // we always make sure they have the latest refreshed value
            // this avoids TimecontrolString and SpeedString being frozen on the same value independently 
            // from what user chooses, e.g. stuck on "fischer" and "blitz"

            // for fischer, byoyomi, or canadian, we use our UHMAEAT for maintimes !
            // simple time is not included in reject messages for maintime : no main time, only period time !
            let universalMaintime = {
                MinimumMaximumSentence : "",        // minimum/maximum
                TimecontrolSentence : "",           // main time - initial time and/or max time, etc..
                SpeedSentence : "",                 // for blitz , live , and corr
                RankedUnrankedGamesIs : "",         // +/- ranked/unranked games is
                TimeNumber : 0,                     // for example 600 (600 seconds)
                TimeToString : "",                  // for example "10 minutes"  = timespanToDisplayString(config.xxx)
                TimeNotificationToString : "",      // for example user wants "1 seconds" = timespanToDisplayString(t.xxx)
                IncreaseDecreaseSentence : "",      // , please increase/decrease
                                                    // main time - MaintimeTimecontrolSentence again
                EndingSentence : "",                // optionnal, for example in canadian, adds explanation
                ConnBelowAboveSentence : "",        // for conn_log : below/above
                ConnSentence : "",                  // for conn_log sentence
                TimecontrolString : "",             /*"fischer" , "simple", "byoyomi" , "canadian" , "absolute"*/
                SpeedString : "",                   /* "blitz" , "live" , "corr" */
            };

            /////////////////////////////////////////////////////////////////////////////////////
            // before starting, general information : 
            // 0) "none" doesnt have a period time, so we let it slide from both maintime and 
            // periodtime rejects
            // (we have sanity checks just in case)
            // 1) simple time doesn't have a main time, only a period time, so we let it slide 
            // from maintime rejects
            // 2) fischer : doesnt have a minperiods or maxperiods
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
        ///// version 2.2 for maintimes
        ////// end of *** UHMAEAT v2.2 : Universal Highly Modulable And Expandable Argv Tree ***


        if (config.minperiods && (t.periods < config.minperiods) && !config.minperiodsranked && !config.minperiodsunranked) {
            conn_log(user.username + " wanted too few periods: " + t.periods);
            return { reject: true, msg: "Minimum number of periods is " + config.minperiods + " , please increase the number of periods" };
        }

        if (config.minperiodsranked && (t.periods < config.minperiodsranked) && notification.ranked) {
            conn_log(user.username + " wanted too few periods ranked: " + t.periods);
            return { reject: true, msg: "Minimum number of periods for ranked games is " + config.minperiodsranked + " , please increase the number of periods" };
        }

        if (config.minperiodsunranked && (t.periods < config.minperiodsunranked) && !notification.ranked) {
            conn_log(user.username + " wanted too few periods unranked: " + t.periods);
            return { reject: true, msg: "Minimum number of periods for unranked games is " + config.minperiodsunranked + " , please increase the number of periods" };
        }

        if (config.maxperiods && (t.periods > config.maxperiods) && !config.maxperiodsranked && !config.maxperiodsunranked) {
            conn_log(user.username + " wanted too many periods: " + t.periods);
            return { reject: true, msg: "Maximum number of periods is " + config.maxperiods + " , please reduce the number of periods" };
        }

        if (config.maxperiodsranked && (t.periods > config.maxperiodsranked) && notification.ranked) {
            conn_log(user.username + " wanted too many periods ranked: " + t.periods);
            return { reject: true, msg: "Maximum number of periods for ranked games is " + config.maxperiodsranked + " , please reduce the number of periods" };
        }

        if (config.maxperiodsunranked && (t.periods > config.maxperiodsunranked) && !notification.ranked) {
            conn_log(user.username + " wanted too many periods unranked: " + t.periods);
            return { reject: true, msg: "Maximum number of periods for unranked games is " + config.maxperiodsunranked + " , please reduce the number of periods" };
        }

        ////// begining of *** UHMAEAT v2.2: Universal Highly Modulable And Expandable Argv Tree ***
        ///// version 2.2 for periodtimes
        if (config.minperiodtimeblitz || config.minperiodtimeblitzranked || config.minperiodtimeblitzunranked || config.maxperiodtimeblitz || config.maxperiodtimeblitzranked || config.maxperiodtimeblitzunranked || config.minperiodtimelive || config.minperiodtimeliveranked || config.minperiodtimeliveunranked || config.maxperiodtimelive || config.maxperiodtimeliveranked || config.maxperiodtimeliveunranked || config.minperiodtimecorr || config.minperiodtimecorrranked || config.minperiodtimecorrunranked || config.maxperiodtimecorr || config.maxperiodtimecorrranked || config.maxperiodtimecorrunranked) {
            // later the t.time_control and t.speed can't be used for rule detection for some reason,
            // so storing them now in strings while we can
            // also, whenever before TimecontrolString and SpeedString are going to be tested,
            // we always make sure they have the latest refreshed value
            // this avoids TimecontrolString and SpeedString being frozen on the same value independently 
            // from what user chooses, e.g. stuck on "fischer" and "blitz"

            // for fischer, byoyomi, or canadian, we use our UHMAEAT for periodtimes !
            // simple time is not included in reject messages for periodtime : no period time, only period time !
            let universalPeriodtime = {
                MinimumMaximumSentence : "",        // minimum/maximum
                TimecontrolSentence : "",           // period time, period time for X stones, increment time, etc..
                SpeedSentence : "",                 // for blitz , live , and corr
                RankedUnrankedGamesIs : "",         // +/- ranked/unranked games is
                TimeNumber : 0,                     // for example 600 (600 seconds)
                TimeToString : "",                  // for example "10 minutes"  = timespanToDisplayString(config.xxx)
                TimeNotificationToString : "",      // for example user wants "1 seconds" = timespanToDisplayString(t.xxx)
                IncreaseDecreaseSentence : "",      // , please increase/decrease
                                                    // period time - PeriodtimeTimecontrolSentence again
                EndingSentence : "",                // optionnal, for example in canadian, adds explanation
                ConnBelowAboveSentence : "",        // for conn_log : below/above
                ConnSentence : "",                  // for conn_log sentence
                TimecontrolString : "",             /*"fischer" , "simple", "byoyomi" , "canadian" , "absolute"*/
                SpeedString : "",                   /* "blitz" , "live" , "corr" */
            };

            /////////////////////////////////////////////////////////////////////////////////////
            // before starting, general information : 
            // 0) "none" doesnt have a period time, so we let it slide from both maintime and 
            // periodtime rejects
            // (we have sanity checks just in case)
            // 1) simple time doesn't have a main time, only a period time, so we let it slide 
            // from maintime rejects
            // 2) fischer : doesnt have a minperiods or maxperiods
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
        ///// version 2.2 for periodtimes
        ////// end of *** UHMAEAT v2.2 : Universal Highly Modulable And Expandable Argv Tree ***
        return { reject: false };  // Ok !

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
            .catch((err) => {
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
    }; /* }}} */
    processMove(gamedata) { /* {{{ */
        let game = this.connectToGame(gamedata.id)
        game.makeMove(gamedata.move_number);
    }; /* }}} */
    processStoneRemoval(gamedata) { /* {{{ */
        return this.processMove(gamedata);
    }; /* }}} */
    on_delete(notification) { /* {{{ */
        /* don't care about delete notifications */
    }; /* }}} */
    on_gameStarted(notification) { /* {{{ */
        /* don't care about gameStarted notifications */
    }; /* }}} */
    addGameForPlayer(game_id, player) { /* {{{ */
        if (!this.games_by_player[player]) {
            this.games_by_player[player] = [ game_id ];
            return;
        }
        if (this.games_by_player[player].indexOf(game_id) != -1)  // Already have it ?
            return;
        this.games_by_player[player].push(game_id);
    } /* }}} */
    removeGameForPlayer(game_id) { /* {{{ */
        for (let player in this.games_by_player) {
            let idx = this.games_by_player[player].indexOf(game_id);
            if (idx == -1)  continue;

            this.games_by_player[player].splice(idx, 1);  // Remove element
            if (this.games_by_player[player].length == 0)
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
        if (typeof(param) == 'object' && 'error' in param) {
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
function get(path, data, cb, eb) { return request("GET", config.host, config.port, path, data, cb, eb); }
function put(path, data, cb, eb) { return request("PUT", config.host, config.port, path, data, cb, eb); }
function del(path, data, cb, eb) { return request("DELETE", config.host, config.port, path, data, cb, eb); }
function request(method, host, port, path, data) { /* {{{ */
    return new Promise((resolve, reject) => {
        if (config.DEBUG) {
            console.debug(method, host, port, path, data);
        }

        let enc_data_type = "application/x-www-form-urlencoded";
        for (let k in data) {
            if (typeof(data[k]) == "object") {
                enc_data_type = "application/json";
            }
        }

        let headers = null;
        if (data._headers) {
            data = dup(data)
            headers = data._headers;
            delete data._headers;
        }

        let enc_data = null;
        if (enc_data_type == "application/json") {
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
