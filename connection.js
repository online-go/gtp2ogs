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
        this.connected_game_timeouts = {};
        this.games_by_player = {};     // Keep track of connected games per player
        this.connected = false;

        this.connect_timeout = setTimeout(()=>{
            if (!this.connected) {
                console.error(`Failed to connect to ${prefix}`);
                process.exit(-1);
            }
        }, (/online-go.com$/.test(config.host)) ? 5000 : 500);


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
                    //
                    for (let game_id in this.connected_games) {
                        if (this.connected_games[game_id].corr_move_pending) {
                            this.connected_games[game_id].makeMove(this.connected_games[game_id].state.moves.length);
                            break;
                        }
                    }
                }
            }, 10000);
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
            if (config.timeout)
            {
                for (let game_id in this.connected_game_timeouts)
                {
                    if (config.DEBUG) conn_log("clearTimeout because disconnect from server", game_id);
                    clearTimeout(this.connected_game_timeouts[game_id]);
                }
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

            if (gamedata.phase == "play" && gamedata.player_to_move == this.bot_id) {
                // Going to make moves based on gamedata or moves coming in for now on, instead of active_game updates
                // game.makeMove(gamedata.move_number);

                if (config.timeout)
                {
                    if (this.connected_game_timeouts[gamedata.id]) {
                        clearTimeout(this.connected_game_timeouts[gamedata.id])
                    }
                    if (config.DEBUG) conn_log("Setting timeout for", gamedata.id);
                    this.connected_game_timeouts[gamedata.id] = setTimeout(() => {
                        if (config.DEBUG) conn_log("TimeOut activated to disconnect from", gamedata.id);
                        this.disconnectFromGame(gamedata.id);
                    }, config.timeout); /* forget about game after --timeout seconds */
                }
            }

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
            } else {
                if (config.timeout)
                {
                    if (this.connected_game_timeouts[gamedata.id]) {
                        clearTimeout(this.connected_game_timeouts[gamedata.id])
                    }
                    if (config.DEBUG) conn_log("Setting timeout for", gamedata.id);
                    this.connected_game_timeouts[gamedata.id] = setTimeout(() => {
                        this.disconnectFromGame(gamedata.id);
                    }, config.timeout); /* forget about game after --timeout seconds */
                }
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
        if (config.timeout)
        {
            if (game_id in this.connected_games) {
                clearTimeout(this.connected_game_timeouts[game_id])
            }
            this.connected_game_timeouts[game_id] = setTimeout(() => {
                this.disconnectFromGame(game_id);
            }, config.timeout); /* forget about game after --timeout seconds */
        }

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
        if (config.timeout)
        {
            if (game_id in this.connected_game_timeouts)
            {
                if (config.DEBUG) conn_log("clearTimeout in disconnectFromGame", game_id);
                clearTimeout(this.connected_game_timeouts[game_id]);
            }
        }
        if (game_id in this.connected_games) {
            this.connected_games[game_id].disconnect();
            delete this.connected_games[game_id];
            delete this.connected_game_timeouts[game_id];
        }

        // TODO Following 2 lines seem duplicate of above? Safe to remove?
        delete this.connected_games[game_id];
        if (config.timeout) delete this.connected_game_timeouts[game_id];
    }; /* }}} */
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

        // ** first we eliminate "absolute" time control : no support for the use of a maintime + periodtime
        // using "absolute" (no period time) is likely to make bots timeout or play way too fast 
        /* "fischer" , "simple", "byoyomi" , "canadian" , "absolute"*/
        let TimeControlString = String(t.time_control);
        if (TimeControlString === "absolute") {
            conn_log("Minimum and Maximum main time is not supported in time control " + TimeControlString);
            return { reject: true, msg: "Period time management is not supported in the time control " + TimeControlString + " , please choose a time control that supports the use of a period time, such as byoyomi,fischer,canadian." }; // simple is possible too, but we dont want to promote it
        }

        if (config.rankedonly && !notification.ranked) {
            conn_log("Ranked games only");
            return { reject: true, msg: "This bot accepts ranked games only. " };
        }

        if (config.unrankedonly && notification.ranked) {
            conn_log("Unranked games only");
            return { reject: true, msg: "This bot accepts Unranked games only. " };
        }

        // for square board sizes only
        if (notification.width != notification.height && !config.allow_all_sizes && !config.allow_custom_sizes) {
            conn_log("board was not square, rejecting challenge");
            return { reject: true, msg: "In your selected board size " + notification.width + "x" + notification.height + " (width x height), Board was not square, please choose a square board size (same width and height, for example 9x9 or 19x19). " };
        }

        if (!config.allowed_sizes[notification.width] && !config.allow_all_sizes && !config.allow_custom_sizes) {
            conn_log("square board size " + notification.width + "x" + notification.height + " is not an allowed size, rejecting challenge");
            return { reject: true, msg: "Board size " + notification.width + "x" + notification.height + " is not allowed, please choose one of the allowed square board sizes (same width and height, for example if allowed boardsizes are 9,13,19, it means you can play only 9x9 , 13x13, and 19x19), these are the allowed square board sizes : " + config.boardsize };
        }

        // for custom board sizes, including square board sizes if width == height as well
        if (!config.allow_all_sizes && config.allow_custom_sizes && !config.allowed_custom_boardsizewidth[notification.width]) {
            conn_log("custom board width " + notification.width + " is not an allowed custom board width, rejecting challenge");
            return { reject: true, msg: "In your selected board size " + notification.width + "x" + notification.height + " (width x height), board WIDTH (" + notification.width + ") is not allowed, please choose one of these allowed CUSTOM board WIDTH values : " + config.boardsizewidth };
        }

        if (!config.allow_all_sizes && config.allow_custom_sizes && !config.allowed_custom_boardsizeheight[notification.height]) {
            conn_log("custom board height " + notification.height + " is not an allowed custom board height, rejecting challenge");
            return { reject: true, msg: "In your selected board size " + notification.width + "x" + notification.height + " (width x height), board HEIGHT (" + notification.height + ") is not allowed, please choose one of these allowed CUSTOM board HEIGHT values : " + config.boardsizeheight };
        }

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

        if (!config.allowed_komi[notification.komi] && !config.allow_all_komi) {
            conn_log("komi value " + notification.komi + " is not an allowed komi, allowed komi are: " + config.komi + ", rejecting challenge");
            return { reject: true, msg: "komi " + notification.komi + " is not an allowed komi, please choose one of these allowed komi : " + config.komi };
        }

        if (!config.allowed_speeds[t.speed]) {
            conn_log(user.username + " wanted speed " + t.speed + ", not in: " + config.speed);
            return { reject: true, msg: "The " + t.speed + " game speed is not allowed, please choose one of these allowed game speeds : " + config.speed };
        }

        if (!config.allowed_timecontrols[t.time_control]) {
            conn_log(user.username + " wanted time control " + t.time_control + ", not in: " + config.timecontrol);
            return { reject: true, msg: "The " + t.time_control + " time control is not allowed, please choose one of these allowed time controls : " + config.timecontrol };
        }

        ////// begining of *** UHMAEAT v2: Universal Highly Modulable And Expandable Argv Tree ***
        ///// version 2.0 for maintimes
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
                MinimumMaximumSentence : "",            // minimum/maximum
                TimecontrolSentence : "",               // main time - initial time and/or max time, etc..
                SpeedSentence : "",                     // for blitz , live , and corr
                RankedUnrankedGamesIs : "",             // +/- ranked/unranked games is
                TimeNumber : 0,                         // for example 600 (600 seconds)
                ToString : "",                          // for example "10 minutes"  = timespanToDisplayString(config.xxx)
                IncreaseDecreaseSentence : "",          // , please increase/decrease
                                                        // main time - MaintimeTimecontrolSentence again
                EndingSentence : "",                    // optionnal, for example in canadian, adds explanation
                ConnBelowAboveSentence : "",            // for conn_log : below/above
                ConnSentence : "",                      // for conn_log sentence
                TimecontrolString : "",                 /*"fischer" , "simple", "byoyomi" , "canadian" , "absolute"*/
                SpeedString : "",                       /* "blitz" , "live" , "corr" */
            };

            // before starting, information : 
            // 1) simple time doesn't have a main time, only a period time, 
            // so we let it slide from maintime rejects
            // 2) fischer : doesnt have a minperiods or maxperiods
            // 3) while using gedit "find and replace", make sure you dont replace
            // t.max_time to t.min_time ! (it doesnt exist !)

            // before starting, make sures : we refresh values //
            // now just before TimecontrolString is being tested, we again make sure it has the latest value
            /*"fischer", "byoyomi", "canadian", "simple" */
            this.TimecontrolString = String(t.time_control);
            // now just before SpeedString is being tested, we again make sure it has the latest value
            /* "live", "correspondence" */
            this.SpeedString = String(t.speed);

            // before starting, sanity checks //
            // sanity check : if not fischer, not byoyomi, not canadian, not simple
            if ((this.TimecontrolString !== "fischer") && (this.TimecontrolString !== "byoyomi") && (this.TimecontrolString !== "canadian") && (this.TimecontrolString !== "simple")) {
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
                this.ConnSentence = user.username + " wanted " + this.TimecontrolString + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence ;
                if (config.minmaintimeblitz && !config.minmaintimeblitzranked && !config.minmaintimeblitzunranked) {
                    this.NumberValue = config.minmaintimeblitz;
                    this.ToString = timespanToDisplayString(config.minmaintimeblitz);
                    this.RankedUnrankedGamesIsSentence = "games is ";
                }
                if (config.minmaintimeblitzranked && notification.ranked) {
                    this.NumberValue = config.minmaintimeblitzranked;
                    this.ToString = timespanToDisplayString(config.minmaintimeblitzranked);
                    this.RankedUnrankedGamesIsSentence = "ranked games is ";
                }
                if (config.minmaintimeblitzunranked && !notification.ranked) {
                    this.NumberValue = config.minmaintimeblitzunranked;
                    this.ToString = timespanToDisplayString(config.minmaintimeblitzunranked);
                    this.RankedUnrankedGamesIsSentence = "unranked games is ";
                }

                if ((this.TimecontrolString === "fischer") && ((t.initial_time < this.NumberValue) || (t.max_time < this.NumberValue))) {
                    this.TimecontrolSentence = "Initial Time and/or Max Time ";
                    this.EndingSentence = ".";
                    conn_log(this.ConnSentence + this.ToString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.ToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "byoyomi") && t.main_time < this.NumberValue) {
                    this.TimecontrolSentence = "Main Time ";
                    this.EndingSentence = ".";
                    conn_log(this.ConnSentence + this.ToString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.ToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "canadian") && t.main_time < this.NumberValue) {
                    this.TimecontrolSentence = "Main Time ";
                    this.EndingSentence = ".";
                    conn_log(this.ConnSentence + this.ToString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.ToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
            }

            // max
            if ((config.maxmaintimeblitz || config.maxmaintimeblitzranked || config.maxmaintimeblitzunranked) && (this.SpeedString === "blitz")) {
                this.MinimumMaximumSentence = "Maximum ";
                this.SpeedSentence = "for " + this.SpeedString + " ";
                this.IncreaseDecreaseSentence = ", please reduce ";
                this.ConnBelowAboveSentence = " above ";
                this.ConnSentence = user.username + " wanted " + this.TimecontrolString + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence ;
                if (config.maxmaintimeblitz && !config.maxmaintimeblitzranked && !config.maxmaintimeblitzunranked) {
                    this.NumberValue = config.maxmaintimeblitz;
                    this.ToString = timespanToDisplayString(config.maxmaintimeblitz);
                    this.RankedUnrankedGamesIsSentence = "games is ";
                }
                if (config.maxmaintimeblitzranked && notification.ranked) {
                    this.NumberValue = config.maxmaintimeblitzranked;
                    this.ToString = timespanToDisplayString(config.maxmaintimeblitzranked);
                    this.RankedUnrankedGamesIsSentence = "ranked games is ";
                }
                if (config.maxmaintimeblitzunranked && !notification.ranked) {
                    this.NumberValue = config.maxmaintimeblitzunranked;
                    this.ToString = timespanToDisplayString(config.maxmaintimeblitzunranked);
                    this.RankedUnrankedGamesIsSentence = "unranked games is ";
                }

                if ((this.TimecontrolString === "fischer") && ((t.initial_time > this.NumberValue) || (t.max_time > this.NumberValue))) {
                    this.TimecontrolSentence = "Initial Time and/or Max Time ";
                    this.EndingSentence = ".";
                    conn_log(this.ConnSentence + this.ToString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.ToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "byoyomi") && t.main_time > this.NumberValue) {
                    this.TimecontrolSentence = "Main Time ";
                    this.EndingSentence = ".";
                    conn_log(this.ConnSentence + this.ToString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.ToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "canadian") && t.main_time > this.NumberValue) {
                    this.TimecontrolSentence = "Main Time ";
                    this.EndingSentence = ".";
                    conn_log(this.ConnSentence + this.ToString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.ToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
            }      

            //////////// for live games : "live" //////////////////
            // min
            if ((config.minmaintimelive || config.minmaintimeliveranked || config.minmaintimeliveunranked) && (this.SpeedString === "live")) {
                this.MinimumMaximumSentence = "Minimum ";
                this.SpeedSentence = "for " + this.SpeedString + " ";
                this.IncreaseDecreaseSentence = ", please increase ";
                this.ConnBelowAboveSentence = " below ";
                this.ConnSentence = user.username + " wanted " + this.TimecontrolString + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence ;
                if (config.minmaintimelive && !config.minmaintimeliveranked && !config.minmaintimeliveunranked) {
                    this.NumberValue = config.minmaintimelive;
                    this.ToString = timespanToDisplayString(config.minmaintimelive);
                    this.RankedUnrankedGamesIsSentence = "games is ";
                }
                if (config.minmaintimeliveranked && notification.ranked) {
                    this.NumberValue = config.minmaintimeliveranked;
                    this.ToString = timespanToDisplayString(config.minmaintimeliveranked);
                    this.RankedUnrankedGamesIsSentence = "ranked games is ";
                }
                if (config.minmaintimeliveunranked && !notification.ranked) {
                    this.NumberValue = config.minmaintimeliveunranked;
                    this.ToString = timespanToDisplayString(config.minmaintimeliveunranked);
                    this.RankedUnrankedGamesIsSentence = "unranked games is ";
                }

                if ((this.TimecontrolString === "fischer") && ((t.initial_time < this.NumberValue) || (t.max_time < this.NumberValue))) {
                    this.TimecontrolSentence = "Initial Time and/or Max Time ";
                    this.EndingSentence = ".";
                    conn_log(this.ConnSentence + this.ToString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.ToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "byoyomi") && t.main_time < this.NumberValue) {
                    this.TimecontrolSentence = "Main Time ";
                    this.EndingSentence = ".";
                    conn_log(this.ConnSentence + this.ToString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.ToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "canadian") && t.main_time < this.NumberValue) {
                    this.TimecontrolSentence = "Main Time ";
                    this.EndingSentence = ".";
                    conn_log(this.ConnSentence + this.ToString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.ToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
            }

            // max
            if ((config.maxmaintimelive || config.maxmaintimeliveranked || config.maxmaintimeliveunranked) && (this.SpeedString === "live")) {
                this.MinimumMaximumSentence = "Maximum ";
                this.SpeedSentence = "for " + this.SpeedString + " ";
                this.IncreaseDecreaseSentence = ", please reduce ";
                this.ConnBelowAboveSentence = " above ";
                this.ConnSentence = user.username + " wanted " + this.TimecontrolString + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence ;
                if (config.maxmaintimelive && !config.maxmaintimeliveranked && !config.maxmaintimeliveunranked) {
                    this.NumberValue = config.maxmaintimelive;
                    this.ToString = timespanToDisplayString(config.maxmaintimelive);
                    this.RankedUnrankedGamesIsSentence = "games is ";
                }
                if (config.maxmaintimeliveranked && notification.ranked) {
                    this.NumberValue = config.maxmaintimeliveranked;
                    this.ToString = timespanToDisplayString(config.maxmaintimeliveranked);
                    this.RankedUnrankedGamesIsSentence = "ranked games is ";
                }
                if (config.maxmaintimeliveunranked && !notification.ranked) {
                    this.NumberValue = config.maxmaintimeliveunranked;
                    this.ToString = timespanToDisplayString(config.maxmaintimeliveunranked);
                    this.RankedUnrankedGamesIsSentence = "unranked games is ";
                }

                if ((this.TimecontrolString === "fischer") && ((t.initial_time > this.NumberValue) || (t.max_time > this.NumberValue))) {
                    this.TimecontrolSentence = "Initial Time and/or Max Time ";
                    this.EndingSentence = ".";
                    conn_log(this.ConnSentence + this.ToString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.ToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "byoyomi") && t.main_time > this.NumberValue) {
                    this.TimecontrolSentence = "Main Time ";
                    this.EndingSentence = ".";
                    conn_log(this.ConnSentence + this.ToString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.ToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "canadian") && t.main_time > this.NumberValue) {
                    this.TimecontrolSentence = "Main Time ";
                    this.EndingSentence = ".";
                    conn_log(this.ConnSentence + this.ToString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.ToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
            }

            //////////// for correspondence games : "correspondence" //////////////////
            // min
            if ((config.minmaintimecorr || config.minmaintimecorrranked || config.minmaintimecorrunranked) && (this.SpeedString === "correspondence")) {
                this.MinimumMaximumSentence = "Minimum ";
                this.SpeedSentence = "for " + this.SpeedString + " ";
                this.IncreaseDecreaseSentence = ", please increase ";
                this.ConnBelowAboveSentence = " below ";
                this.ConnSentence = user.username + " wanted " + this.TimecontrolString + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence ;
                if (config.minmaintimecorr && !config.minmaintimecorrranked && !config.minmaintimecorrunranked) {
                    this.NumberValue = config.minmaintimecorr;
                    this.ToString = timespanToDisplayString(config.minmaintimecorr);
                    this.RankedUnrankedGamesIsSentence = "games is ";
                }
                if (config.minmaintimecorrranked && notification.ranked) {
                    this.NumberValue = config.minmaintimecorrranked;
                    this.ToString = timespanToDisplayString(config.minmaintimecorrranked);
                    this.RankedUnrankedGamesIsSentence = "ranked games is ";
                }
                if (config.minmaintimecorrunranked && !notification.ranked) {
                    this.NumberValue = config.minmaintimecorrunranked;
                    this.ToString = timespanToDisplayString(config.minmaintimecorrunranked);
                    this.RankedUnrankedGamesIsSentence = "unranked games is ";
                }

                if ((this.TimecontrolString === "fischer") && ((t.initial_time < this.NumberValue) || (t.max_time < this.NumberValue))) {
                    this.TimecontrolSentence = "Initial Time and/or Max Time ";
                    this.EndingSentence = ".";
                    conn_log(this.ConnSentence + this.ToString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.ToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "byoyomi") && t.main_time < this.NumberValue) {
                    this.TimecontrolSentence = "Main Time ";
                    this.EndingSentence = ".";
                    conn_log(this.ConnSentence + this.ToString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.ToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "canadian") && t.main_time < this.NumberValue) {
                    this.TimecontrolSentence = "Main Time ";
                    this.EndingSentence = ".";
                    conn_log(this.ConnSentence + this.ToString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.ToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
            }

            // max
            if ((config.maxmaintimecorr || config.maxmaintimecorrranked || config.maxmaintimecorrunranked) && (this.SpeedString === "correspondence")) {
                this.MinimumMaximumSentence = "Maximum ";
                this.SpeedSentence = "for " + this.SpeedString + " ";
                this.IncreaseDecreaseSentence = ", please reduce ";
                this.ConnBelowAboveSentence = " above ";
                this.ConnSentence = user.username + " wanted " + this.TimecontrolString + this.ConnBelowAboveSentence + this.MinimumMaximumSentence + this.TimecontrolSentence ;
                if (config.maxmaintimecorr && !config.maxmaintimecorrranked && !config.maxmaintimecorrunranked) {
                    this.NumberValue = config.maxmaintimecorr;
                    this.ToString = timespanToDisplayString(config.maxmaintimecorr);
                    this.RankedUnrankedGamesIsSentence = "games is ";
                }
                if (config.maxmaintimecorrranked && notification.ranked) {
                    this.NumberValue = config.maxmaintimecorrranked;
                    this.ToString = timespanToDisplayString(config.maxmaintimecorrranked);
                    this.RankedUnrankedGamesIsSentence = "ranked games is ";
                }
                if (config.maxmaintimecorrunranked && !notification.ranked) {
                    this.NumberValue = config.maxmaintimecorrunranked;
                    this.ToString = timespanToDisplayString(config.maxmaintimecorrunranked);
                    this.RankedUnrankedGamesIsSentence = "unranked games is ";
                }

                if ((this.TimecontrolString === "fischer") && ((t.initial_time > this.NumberValue) || (t.max_time > this.NumberValue))) {
                    this.TimecontrolSentence = "Initial Time and/or Max Time ";
                    this.EndingSentence = ".";
                    conn_log(this.ConnSentence + this.ToString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.ToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "byoyomi") && t.main_time > this.NumberValue) {
                    this.TimecontrolSentence = "Main Time ";
                    this.EndingSentence = ".";
                    conn_log(this.ConnSentence + this.ToString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.ToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
                if ((this.TimecontrolString === "canadian") && t.main_time > this.NumberValue) {
                    this.TimecontrolSentence = "Main Time ";
                    this.EndingSentence = ".";
                    conn_log(this.ConnSentence + this.ToString + " in " + this.TimecontrolString);
                    return { reject : true, msg:  `${this.MinimumMaximumSentence} ${this.TimecontrolSentence} ${this.SpeedSentence} ${this.RankedUnrankedGamesIsSentence} ${this.ToString} ${this.IncreaseDecreaseSentence} ${this.TimecontrolSentence} ${this.EndingSentence}` };
                }
            }
        }
        ///// version 2.0 for maintimes
        ////// end of *** UHMAEAT v2 : Universal Highly Modulable And Expandable Argv Tree ***

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

        ////// begining of *** UHMAEAT : Universal Highly Modulable And Expandable Argv Tree ***
        // version 1.0 for period times //

        if (config.minperiodtime || config.minperiodtimeranked || config.minperiodtimeunranked || config.maxperiodtime || config.maxperiodtimeranked || config.maxperiodtimeunranked) {
            // later the t.time_control can't be used for rule detection for some reason,
            // so storing it now in a string while we can
            // also, whenever before TimecontrolString is going to be tested,
            // we always make sure it has the latest value
            // this avoids TimecontrolString being frozen on the same value independently from what user chooses, 
            // e.g. stuck on "absolute"  

            // for fischer, byoyomi, canadian, simple, we use our UHMAEAT !
            let universalPeriodtimeMinimumMaximumSentence = "";    // minimum
            let universalPeriodtimeTimecontrolSentence = "";       // period time - initial time and/or max time, etc..
            let universalPeriodtimeForRankedUnrankedSentence = ""; // +/- for ranked/unranked games is
            let universalPeriodtimeNumber = 0;                     // for example 600 (600 seconds)
            let universalPeriodtimeToString = "";                  // for example "10 minutes"  = timespanToDisplayString(config.xxx)
            let universalPeriodtimeIncreaseDecreaseSentence = "";  // , please increase/decrease
                                                                 // period time - PeriodtimeTimecontrolSentence again
            let universalPeriodtimeEndingSentence = "";            // optionnal, for example in canadian, adds explanation
            let universalPeriodtimeTimecontrolString = String(t.time_control);/*
            "fischer" , "simple", "byoyomi" , "canadian" , "absolute"*/

            // for canadian we add a small explanation how to understand period time for all stones //
            let canadianPeriodtimeSentence = ""; // see "canadian" for details

            if (config.minperiodtime || config.minperiodtimeranked || config.minperiodtimeunranked) {
                universalPeriodtimeMinimumMaximumSentence = "Minimum ";
                universalPeriodtimeIncreaseDecreaseSentence = ", please increase ";
                let universalPeriodtimeConnSentence = user.username + " wanted period time below minimum period time ";
                if (config.minperiodtime && !config.minperiodtimeranked && !config.minperiodtimeunranked) {
                    universalPeriodtimeNumber = config.minperiodtime;
                    universalPeriodtimeToString = timespanToDisplayString(config.minperiodtime);
                    universalPeriodtimeForRankedUnrankedSentence = "is ";
                }
                if (config.minperiodtimeranked && notification.ranked) {
                    universalPeriodtimeNumber = config.minperiodtimeranked;
                    universalPeriodtimeToString = timespanToDisplayString(config.minperiodtimeranked);
                    universalPeriodtimeForRankedUnrankedSentence = "for ranked games is ";
                }
                if (config.minperiodtimeunranked && !notification.ranked) {
                    universalPeriodtimeNumber = config.minperiodtimeunranked;
                    universalPeriodtimeToString = timespanToDisplayString(config.minperiodtimeunranked);
                    universalPeriodtimeForRankedUnrankedSentence = "for unranked games is ";
                 }
                // now just before TimecontrolString is being tested, we again make sure it has the latest value
                universalPeriodtimeTimecontrolString = String(t.time_control);/*
                "fischer", "byoyomi", "canadian", "simple" */

                // sanity check : if not fischer, not byoyomi, not canadian, not simple
                // time control peculiarities : 
                // - fischer : doesnt have a minperiods or maxperiods
                // - simple : doesnt have a maintime, only periodtime
                if ((universalPeriodtimeTimecontrolString !== "fischer") && (universalPeriodtimeTimecontrolString !== "byoyomi") && (universalPeriodtimeTimecontrolString !== "canadian") && (universalPeriodtimeTimecontrolString !== "simple")) { // simple is part of allowed timecontrols
                    conn_log ("error, could not find allowed time control in " + t.time_control);
                    return { reject : true, msg: "error, could not find allowed time control in " + t.timecontrol};
                }                

                // if sanity check passes :
                if ((universalPeriodtimeTimecontrolString === "fischer") || (universalPeriodtimeTimecontrolString === "byoyomi") || (universalPeriodtimeTimecontrolString === "canadian") || (universalPeriodtimeTimecontrolString === "simple")) {
                    if ((universalPeriodtimeTimecontrolString === "fischer") && (t.time_increment < universalPeriodtimeNumber)) {
                        universalPeriodtimeTimecontrolSentence = "Increment Time ";
                        universalPeriodtimeEndingSentence = ".";
                        conn_log(universalPeriodtimeConnSentence + universalPeriodtimeToString + " in " + universalPeriodtimeTimecontrolString);
                        return { reject : true, msg:  `${universalPeriodtimeMinimumMaximumSentence} ${universalPeriodtimeTimecontrolSentence} ${universalPeriodtimeForRankedUnrankedSentence} ${universalPeriodtimeToString} ${universalPeriodtimeIncreaseDecreaseSentence} ${universalPeriodtimeTimecontrolSentence} ${universalPeriodtimeEndingSentence}` };
                    }
                    if (universalPeriodtimeTimecontrolString === "byoyomi" && t.period_time < universalPeriodtimeNumber) {
                        universalPeriodtimeTimecontrolSentence = "Period Time ";
                        universalPeriodtimeEndingSentence = ".";
                        conn_log(universalPeriodtimeConnSentence + universalPeriodtimeToString + " in " + universalPeriodtimeTimecontrolString);
                        return { reject : true, msg:  `${universalPeriodtimeMinimumMaximumSentence} ${universalPeriodtimeTimecontrolSentence} ${universalPeriodtimeForRankedUnrankedSentence} ${universalPeriodtimeToString} ${universalPeriodtimeIncreaseDecreaseSentence} ${universalPeriodtimeTimecontrolSentence} ${universalPeriodtimeEndingSentence}` };
                    }
                    if (universalPeriodtimeTimecontrolString === "simple" && t.per_move < universalPeriodtimeNumber) {
                        universalPeriodtimeTimecontrolSentence = "Time per move ";
                        universalPeriodtimeEndingSentence = ".";
                        conn_log(universalPeriodtimeConnSentence + universalPeriodtimeToString + " in " + universalPeriodtimeTimecontrolString);
                        return { reject : true, msg:  `${universalPeriodtimeMinimumMaximumSentence} ${universalPeriodtimeTimecontrolSentence} ${universalPeriodtimeForRankedUnrankedSentence} ${universalPeriodtimeToString} ${universalPeriodtimeIncreaseDecreaseSentence} ${universalPeriodtimeTimecontrolSentence} ${universalPeriodtimeEndingSentence}` };
                    }
                    if (universalPeriodtimeTimecontrolString === "canadian" && ((t.period_time / t.stones_per_period) < universalPeriodtimeNumber)) {
                        universalPeriodtimeTimecontrolSentence = "Period Time for " + t.stones_per_period + " stones ";
                        universalPeriodtimeEndingSentence = ".";

                        // for canadian we add a small explanation how to understand period for all stones //
                        // canadian period time is already for n number of stones, dont divide by stone
                        // e.g. 300 seconds divided by 25 stones = 12 seconds / stone
                        // first we reconvert displayedTimeToString
                        if (config.minperiodtime && !config.minperiodtimeranked && !config.minperiodtimeunranked) {
                            universalPeriodtimeNumber = (config.minperiodtime * t.stones_per_period);
                            universalPeriodtimeToString = timespanToDisplayString(universalPeriodtimeNumber);
                        }
                        if (config.minperiodtimeranked && notification.ranked) {
                            universalPeriodtimeNumber = (config.minperiodtimeranked * t.stones_per_period);
                            universalPeriodtimeToString = timespanToDisplayString(universalPeriodtimeNumber);
                        }
                        if (config.minperiodtimeunranked && !notification.ranked) {
                            universalPeriodtimeNumber = (config.minperiodtimeunranked * t.stones_per_period);
                            universalPeriodtimeToString = timespanToDisplayString(universalPeriodtimeNumber);
                        }
                        // then we add the wanted explanation for canadian number of stones
                        canadianPeriodtimeSentence = "for all the " + t.stones_per_period + " stones"; // e.g. "12 seconds per stone, same as 300 seconds for all the 25 stones"

                        universalPeriodtimeEndingSentence = ".";
                        conn_log(universalPeriodtimeConnSentence + universalPeriodtimeToString + " in " + universalPeriodtimeTimecontrolString);
                        return { reject : true, msg:  `${universalPeriodtimeMinimumMaximumSentence} ${universalPeriodtimeTimecontrolSentence} ${universalPeriodtimeForRankedUnrankedSentence} ${universalPeriodtimeToString} ${canadianPeriodtimeSentence} ${universalPeriodtimeIncreaseDecreaseSentence} ${universalPeriodtimeTimecontrolSentence} ${universalPeriodtimeEndingSentence}` };
                    }
                }
            }

            if (config.maxperiodtime || config.maxperiodtimeranked || config.maxperiodtimeunranked) {
                universalPeriodtimeMinimumMaximumSentence = "Maximum ";
                universalPeriodtimeIncreaseDecreaseSentence = ", please reduce ";
                let universalPeriodtimeConnSentence = user.username + " wanted period time above maximum period time ";
                if (config.maxperiodtime && !config.maxperiodtimeranked && !config.maxperiodtimeunranked) {
                    universalPeriodtimeNumber = config.maxperiodtime;
                    universalPeriodtimeToString = timespanToDisplayString(config.maxperiodtime);
                    universalPeriodtimeForRankedUnrankedSentence = "is ";
                }
                if (config.maxperiodtimeranked && notification.ranked) {
                    universalPeriodtimeNumber = config.maxperiodtimeranked;
                    universalPeriodtimeToString = timespanToDisplayString(config.maxperiodtimeranked);
                    universalPeriodtimeForRankedUnrankedSentence = "for ranked games is ";
                }
                if (config.maxperiodtimeunranked && !notification.ranked) {
                    universalPeriodtimeNumber = config.maxperiodtimeunranked;
                    universalPeriodtimeToString = timespanToDisplayString(config.maxperiodtimeunranked);
                    universalPeriodtimeForRankedUnrankedSentence = "for unranked games is ";
                }
                // now just before TimecontrolString is being tested, we again make sure it has the latest value
                universalPeriodtimeTimecontrolString = String(t.time_control);/*
                "fischer", "byoyomi", "canadian", "simple" */

                // sanity check : if not fischer, not byoyomi, not canadian, not simple
                // time control peculiarities : 
                // - fischer : doesnt have a minperiods or maxperiods
                // - simple : doesnt have a maintime, only periodtime, so we let it slide for main time reject
                if ((universalPeriodtimeTimecontrolString !== "fischer") && (universalPeriodtimeTimecontrolString !== "byoyomi") && (universalPeriodtimeTimecontrolString !== "canadian") && (universalPeriodtimeTimecontrolString !== "simple")) {
                    conn_log ("error, could not find allowed time control in " + t.time_control);
                    return { reject : true, msg: "error, could not find allowed time control in " + t.timecontrol};
                }                

                // if sanity check passes :
                if ((universalPeriodtimeTimecontrolString === "fischer") || (universalPeriodtimeTimecontrolString === "byoyomi") || (universalPeriodtimeTimecontrolString === "canadian")) {
                    if ((universalPeriodtimeTimecontrolString === "fischer") && (t.time_increment > universalPeriodtimeNumber)) {
                        universalPeriodtimeTimecontrolSentence = "Increment Time ";
                        universalPeriodtimeEndingSentence = ".";
                        conn_log(universalPeriodtimeConnSentence + universalPeriodtimeToString + " in " + universalPeriodtimeTimecontrolString);
                        return { reject : true, msg:  `${universalPeriodtimeMinimumMaximumSentence} ${universalPeriodtimeTimecontrolSentence} ${universalPeriodtimeForRankedUnrankedSentence} ${universalPeriodtimeToString} ${universalPeriodtimeIncreaseDecreaseSentence} ${universalPeriodtimeTimecontrolSentence} ${universalPeriodtimeEndingSentence}` };
                    }
                    if (universalPeriodtimeTimecontrolString === "byoyomi" && t.period_time > universalPeriodtimeNumber) {
                        universalPeriodtimeTimecontrolSentence = "Period Time ";
                        universalPeriodtimeEndingSentence = ".";
                        conn_log(universalPeriodtimeConnSentence + universalPeriodtimeToString + " in " + universalPeriodtimeTimecontrolString);
                        return { reject : true, msg:  `${universalPeriodtimeMinimumMaximumSentence} ${universalPeriodtimeTimecontrolSentence} ${universalPeriodtimeForRankedUnrankedSentence} ${universalPeriodtimeToString} ${universalPeriodtimeIncreaseDecreaseSentence} ${universalPeriodtimeTimecontrolSentence} ${universalPeriodtimeEndingSentence}` };
                    }
                    if (universalPeriodtimeTimecontrolString === "simple" && t.per_move > universalPeriodtimeNumber) {
                        universalPeriodtimeTimecontrolSentence = "Time per move ";
                        universalPeriodtimeEndingSentence = ".";
                        conn_log(universalPeriodtimeConnSentence + universalPeriodtimeToString + " in " + universalPeriodtimeTimecontrolString);
                        return { reject : true, msg:  `${universalPeriodtimeMinimumMaximumSentence} ${universalPeriodtimeTimecontrolSentence} ${universalPeriodtimeForRankedUnrankedSentence} ${universalPeriodtimeToString} ${universalPeriodtimeIncreaseDecreaseSentence} ${universalPeriodtimeTimecontrolSentence} ${universalPeriodtimeEndingSentence}` };
                    }
                    if (universalPeriodtimeTimecontrolString === "canadian" && ((t.period_time / t.stones_per_period) > universalPeriodtimeNumber)) {
                        universalPeriodtimeTimecontrolSentence = "Period Time for " + t.stones_per_period + " stones " ;

                        // for canadian we add a small explanation how to understand period for all stones //
                        // canadian period time is already for n number of stones, dont divide by stone
                        // e.g. 300 seconds divided by 25 stones = 12 seconds / stone
                        // first we reconvert displayedTimeToString
                        if (config.maxperiodtime && !config.maxperiodtimeranked && !config.maxperiodtimeunranked) {
                            universalPeriodtimeNumber = (config.maxperiodtime * t.stones_per_period);
                            universalPeriodtimeToString = timespanToDisplayString(universalPeriodtimeNumber);
                        }
                        if (config.maxperiodtimeranked && notification.ranked) {
                            universalPeriodtimeNumber = (config.maxperiodtimeranked * t.stones_per_period);
                            universalPeriodtimeToString = timespanToDisplayString(universalPeriodtimeNumber);
                        }
                        if (config.maxperiodtimeunranked && !notification.ranked) {
                            universalPeriodtimeNumber = (config.maxperiodtimeunranked * t.stones_per_period);
                            universalPeriodtimeToString = timespanToDisplayString(universalPeriodtimeNumber);
                        }
                        // then we add the wanted explanation for canadian number of stones
                        canadianPeriodtimeSentence = "for all the " + t.stones_per_period + " stones"; // e.g. "12 seconds per stone, same as 300 seconds for all the 25 stones"

                        universalPeriodtimeEndingSentence = ".";
                        conn_log(universalPeriodtimeConnSentence + universalPeriodtimeToString + " in " + universalPeriodtimeTimecontrolString);
                        return { reject : true, msg:  `${universalPeriodtimeMinimumMaximumSentence} ${universalPeriodtimeTimecontrolSentence} ${universalPeriodtimeForRankedUnrankedSentence} ${universalPeriodtimeToString} ${canadianPeriodtimeSentence} ${universalPeriodtimeIncreaseDecreaseSentence} ${universalPeriodtimeTimecontrolSentence} ${universalPeriodtimeEndingSentence}` };
                    } 
                }
            }
        }
        ////// version 1.0 for period times //////
        ////// end of *** UHMAEAT : Universal Highly Modulable And Expandable Argv Tree ***

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

function timespanToDisplayString(timespan) {
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
