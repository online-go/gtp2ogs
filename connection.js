// vim: tw=120 softtabstop=4 shiftwidth=4

const querystring = require('querystring');

const io = require('socket.io-client');
const http = require('http');
const https = require('https');

const console = require('./console').console;
const config = require('./config');
const Game = require('./game').Game;

/****************/
/** Connection **/
/****************/
const ignorable_notifications = {
    'delete': true,
    'gameStarted': true,
    'gameEnded': true,
    'gameDeclined': true,
    'gameResumedFromStoneRemoval': true,
    'tournamentStarted': true,
    'tournamentEnded': true,
};

class Connection {
    constructor(io_client) {
        const prefix = (config.insecure ? `http://` : `https://`) + `${config.host}:${config.port}`;

        conn_log(`Connecting to ${prefix}`);
        if (!io_client) {
          io_client = io;
        }
        const socket = this.socket = io_client(prefix, {
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
            this.idle_timeout_interval = setInterval(this.disconnectIdleGames.bind(this), 10000);
        }
        if (config.DEBUG) setInterval(this.dumpStatus.bind(this), 15 * 60 * 1000);

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
                    console.error(`ERROR: Bot account is unknown to the system: ${config.username}`);
                    process.exit();
                }
                conn_log("Bot is username: ", config.username);
                conn_log("Bot is user id: ", this.bot_id);
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
                    const candidates = [];
                    for (const game_id in this.connected_games) {
                        if (this.connected_games[game_id].corr_move_pending) {
                            candidates.push(this.connected_games[game_id]);
                        }
                    }
                    // Pick a random game that needs a move.
                    if (candidates.length > 0) {
                        const game = candidates[Math.floor(Math.random()*candidates.length)];
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

            for (const game_id in this.connected_games) {
                this.disconnectFromGame(game_id);
            }
        });

        socket.on('notification', (notification) => {
            if (this[`on_${notification.type}`]) {
                this[`on_${notification.type}`](notification);
            } else {
                if (!(notification.type in ignorable_notifications)) {
                    console.log("Unhandled notification type: ", notification.type, notification);
                }
                if (notification.type !== 'delete') {
                    this.deleteNotification(notification);
                }
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
                        if (config.DEBUG) console.log(`Starting disconnect Timeout in Connection active_game for ${gamedata.id}`);
                        this.connected_games[gamedata.id].disconnect_timeout =
                            setTimeout(() => {  this.disconnectFromGame(gamedata.id);  }, 1000);
                    }
                }
                // Don't connect to finished games.
                return;
            }

            // Set up the game so it can listen for events.
            this.connectToGame(gamedata.id);
        });
    }
    auth(obj) {
        obj.apikey = config.apikey;
        obj.bot_id = this.bot_id;
        obj.player_id = this.bot_id;
        if (this.jwt) {
            obj.jwt = this.jwt;
        }
        return obj;
    }
    connectToGame(game_id) {
        if (game_id in this.connected_games) {
            if (config.DEBUG) conn_log("Connected to game", game_id, "already");
            return this.connected_games[game_id];
        }

        return this.connected_games[game_id] = new Game(this, game_id);
    }
    disconnectFromGame(game_id) {
        if (config.DEBUG) conn_log("disconnectFromGame", game_id);
        if (game_id in this.connected_games) {
            this.connected_games[game_id].disconnect();
            delete this.connected_games[game_id];
        }
    }
    disconnectIdleGames() {
        if (config.DEBUG) conn_log("Looking for idle games to disconnect");
        for (const game_id in this.connected_games) {
            const state = this.connected_games[game_id].state;
            if (state === null) {
                if (config.DEBUG) conn_log("No game state, not checking idle status for", game_id);
                continue;
            }
            const idle_time = Date.now() - state.clock.last_move;
            if ((state.clock.current_player !== this.bot_id) && (idle_time > config.timeout)) {
                if (config.DEBUG) conn_log("Found idle game", game_id, ", other player has been idling for", idle_time, ">", config.timeout);
                this.disconnectFromGame(game_id);
            }
        }
    }
    dumpStatus() {
        for (const game_id in this.connected_games) {
            const game = this.connected_games[game_id];
            const msg = [];
            msg.push(`game_id = ${game_id}:`);
            if (game.state === null) {
                msg.push('no_state');
                conn_log(...msg);
                continue;
            }
            msg.push(`black = ${game.state.players.black.username}`);
            msg.push(`white = ${game.state.players.white.username}`);
            if (game.state.clock.current_player === this.bot_id) {
                msg.push('bot_turn');
            }
            const idle_time = (Date.now() - game.state.clock.last_move) / 1000;
            msg.push(`idle_time = ${idle_time}s`);
            if (game.bot === null) {
                msg.push('no_bot');
                conn_log(...msg);
                continue;
            }
            msg.push(`bot.proc.pid = ${game.bot.pid()}`);
            msg.push(`bot.dead = ${game.bot.dead}`);
            msg.push(`bot.failed = ${game.bot.failed}`);
            conn_log(...msg);
        }
    }
    deleteNotification(notification) {
        this.socket.emit('notification/delete', this.auth({notification_id: notification.id}), () => {
            conn_log("Deleted notification ", notification.id);
        });
    }
    connection_reset() {
        for (const game_id in this.connected_games) {
            this.disconnectFromGame(game_id);
        }
        if (this.socket) {
            this.socket.emit('notification/connect', this.auth({}), (x) => { conn_log(x); });
        }
    }
    on_friendRequest(notification) {
        console.log("Friend request from ", notification.user.username);
        post(api1("me/friends/invitations"), this.auth({ 'from_user': notification.user.id }))
        .then((obj)=> conn_log(obj.body))
        .catch(conn_log);
    }

    // Check challenge mandatory conditions
    //
    checkChallengeMandatory(notification) {

        // check user is acceptable first, else don't mislead user (is professional is in booleans below, not here)
        for (const uid of ["username", "id"]) {
            if (config.banned_users[notification.user[uid]]) {
                return getRejectBanned(notification.user.username, "");
            }
            if (notification.ranked && config.banned_users_ranked[notification.user[uid]]) {
                return getRejectBanned(notification.user.username, "ranked");
            }
            if (!notification.ranked && config.banned_users_unranked[notification.user[uid]]) {
                return getRejectBanned(notification.user.username, "unranked");
            }
        }
        const resultRank = getMinMaxRankRejectResult("rank", notification.user.ranking, notification.ranked);
        if (resultRank) return resultRank;

        // check bot is available, else don't mislead user
        if (config.check_rejectnew()) {
            conn_log("Not accepting new games (rejectnew).");
            return { reject: true, msg: config.rejectnewmsg };
        }
        if (this.connected_games) {
            const number_connected_games = Object.keys(this.connected_games).length;
            if (config.DEBUG) console.log(`# of connected games = ${number_connected_games}`);
            if (number_connected_games >= config.maxconnectedgames) {
                conn_log(`${number_connected_games} games being played, `
                         + `maximum is ${config.maxconnectedgames}`);
                const msg = `Currently, ${number_connected_games} games `
                            + `are being played by this bot, maximum is `
                            + `${config.maxconnectedgames} (if you see this message `
                            + `and you dont see any game on the bot profile page, `
                            + `it is because private game(s) are being played), `
                            + `try again later`;
                return { reject: true, msg };
            }
        } else if (config.DEBUG) {
            console.log("There are no connected games");
        }
        const connected_games_per_user = this.countGamesForPlayer(notification.user.id);
        if (connected_games_per_user >= config.maxconnectedgamesperuser) {
            conn_log("Too many connected games for this user.");
            const msg = `Maximum number of simultaneous games allowed per player `
                        + `against this bot ${config.maxconnectedgamesperuser}, `
                        + `please reduce your number of simultaneous games against `
                        + `this bot, and try again`;
            return { reject: true, msg };
        }

        return { reject: false }; // OK !

    }
    // Check challenge sanity checks
    //
    checkChallengeSanityChecks(notification) {

        // TODO: add all sanity checks here of all unhandled notifications

        // Sanity check: OGS enforces rules to be chinese regardless of user's choice.
        if (!notification.rules.includes("chinese")) {
            conn_log(`Unhandled rules: ${notification.rules}`);
            const msg = `The ${notification.rules} rules are not allowed on this bot, `
                        + `please choose allowed rules, for example chinese rules.`;
            return { reject: true, msg };
        }

        return { reject: false }; // OK !

    }
    // Check challenge booleans allow a game ("nopause" is in game.js, not here)
    //
    checkChallengeBooleans(notification) {

        if (config.rankedonly && !notification.ranked) {
            return getBooleansGeneralReject("Unranked games are");
        }
        if (config.unrankedonly && notification.ranked) {
            return getBooleansGeneralReject("Ranked games are");
        }

        const testBooleanArgs_r_u = [ ["proonly", "Games against non-professionals are", !notification.user.professional, ""],
                                      ["nopauseonweekends", "Pause on week-ends is", notification.pause_on_weekends, ""],
                                      ["noautohandicap", "-Automatic- handicap is", (notification.handicap === -1), 
                                       ", please manually choose the number of handicap stones"]
                                    ];

        for (const [familyName, nameF, notifCondition, ending] of testBooleanArgs_r_u) {
            if (notifCondition) {
                for (const [argName, rankedCondition] of get_r_u_arr_booleans(familyName, notification.ranked)) {
                    if (config[argName] && rankedCondition) {
                        return getBooleans_r_u_Reject(argName, nameF, ending);
                    }
                }
            }
        }

        return { reject: false }; // OK !

    }
    // Check challenge allowed families settings are allowed
    //
    checkChallengeAllowedFamilies(notification) {

        // only square boardsizes, except if all is allowed
        if (notification.width !== notification.height) {
            if (!config.allow_all_boardsizes && !config.boardsizesranked && !config.boardsizesunranked) {
                return getBoardsizeNotSquareReject("boardsizes", notification.width, notification.height);
            }
            if (!config.allow_all_boardsizes_ranked && notification.ranked) {
                return getBoardsizeNotSquareReject("boardsizesranked", notification.width, notification.height);
            }
            if (!config.allow_all_boardsizes_unranked && !notification.ranked) {
                return getBoardsizeNotSquareReject("boardsizesunranked", notification.width, notification.height);
            }
        }
        
        // if square, check if square board size is allowed
        if (!config.allowed_boardsizes[notification.width] && !config.allow_all_boardsizes && !config.boardsizesranked && !config.boardsizesunranked) {
            return genericAllowedFamiliesReject("boardsizes", notification.width);
        }
        if (!config.allowed_boardsizes_ranked[notification.width] && !config.allow_all_boardsizes_ranked && notification.ranked && config.boardsizesranked) {
            return genericAllowedFamiliesReject("boardsizesranked", notification.width);
        }
        if (!config.allowed_boardsizes_unranked[notification.width] && !config.allow_all_boardsizes_unranked && !notification.ranked && config.boardsizesunranked) {
            return genericAllowedFamiliesReject("boardsizesunranked", notification.width);
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

        return { reject: false }; // OK !

    }
    // Check challenge settings are allowed
    //
    checkChallengeSettings(notification) {

        let handicapNotifCorrected = notification.handicap;
        if (notification.handicap === -1 && config.fakerank) {
            // TODO: modify or remove fakerank code whenever server sends us automatic handicap
            //       notification.handicap different from -1.
            // adding a .floor: 5.9k (6k) vs 6.1k (7k) is 0.2 rank difference,
            // but it is still a 6k vs 7k = 1 rank difference = 1 automatic handicap stone

            handicapNotifCorrected = Math.abs(Math.floor(notification.user.ranking) - Math.floor(config.fakerank));
        }
        const resultHandicap = getMinMaxHandicapPeriodsRejectResult("handicap", "handicap stones", handicapNotifCorrected, Boolean(config.fakerank), "", notification.ranked);
        if (resultHandicap) return resultHandicap;

        const blitzLiveCorr = getBlitzLiveCorr(notification.time_control.speed);

        const resultMaintime = getMinMaxMainPeriodTimeRejectResult(`maintime${blitzLiveCorr}`, notification.time_control, notification.ranked);
        if (resultMaintime) return resultMaintime;

        // "fischer", "canadian", "simple", "absolute", "none", don't have a periods number,
        // undefined arg compared to notificationT.periods will always return false, thus
        // always rejecting: don't check it.
        //
        if (notification.time_control.time_control === "byoyomi") {
            const resultPeriods = getMinMaxHandicapPeriodsRejectResult(`periods${blitzLiveCorr}`, "periods", notification.time_control.periods, false, `${blitzLiveCorr} `, notification.ranked);
            if (resultPeriods) return resultPeriods;
        }
        
        const resultPeriodtime = getMinMaxMainPeriodTimeRejectResult(`periodtime${blitzLiveCorr}`, notification.time_control, notification.ranked);
        if (resultPeriodtime) return resultPeriodtime;

        return { reject: false };  // Ok !

    }
    // Check challenge entirely, and return reject status + optional error msg.
    //
    checkChallenge(notification) {

        for (const test of [this.checkChallengeMandatory,
                           this.checkChallengeSanityChecks,
                           this.checkChallengeBooleans,
                           this.checkChallengeAllowedFamilies,
                           this.checkChallengeSettings]) {
            const result = test.bind(this)(notification);
            if (result.reject) return result;
        }

        return { reject: false };  /* All good. */

    }
    on_challenge(notification) {
        const c0 = this.checkChallenge(notification);
        const rejectmsg = (c0.msg ? c0.msg : "");

        const handi = (notification.handicap > 0 ? `H${notification.handicap}` : "");
        const accepting = (c0.reject ? "Rejecting" : "Accepting");
        conn_log(`${accepting} challenge from ${notification.user.username} `
                 + `(${rankToString(notification.user.ranking)})  `
                 + `[${notification.width}x${notification.height}] ${handi} `
                 + `id = ${notification.game_id}`);

        if (!c0.reject) {
            post(api1(`me/challenges/${notification.challenge_id}/accept`), this.auth({ }))
            .then(ignore)
            .catch(() => {
                conn_log("Error accepting challenge, declining it");
                post(api1(`me/challenges/${notification.challenge_id}`), this.auth({ 
                    'delete': true,
                    'message': 'Error accepting game challenge, challenge has been removed.',
                }))
                .then(ignore)
                .catch(conn_log)
                this.deleteNotification(notification);
            })
        } else {
            post(api1(`me/challenges/${notification.challenge_id}`), this.auth({
                'delete': true,
                'message': rejectmsg || "The AI you've challenged has rejected this game.",
            }))
            .then(ignore)
            .catch(conn_log)
        }
    }
    // processMove(gamedata) {
    //     const game = this.connectToGame(gamedata.id)
    //     game.makeMove(gamedata.move_number);
    // }
    addGameForPlayer(game_id, player) {
        if (!this.games_by_player[player]) {
            this.games_by_player[player] = [ game_id ];
            return;
        }
        if (this.games_by_player[player].indexOf(game_id) !== -1) { // Already have it ?
            return;
        }
        this.games_by_player[player].push(game_id);
    }
    removeGameForPlayer(game_id) {
        for (const player in this.games_by_player) {
            const idx = this.games_by_player[player].indexOf(game_id);
            if (idx === -1) continue;

            this.games_by_player[player].splice(idx, 1);  // Remove element
            if (this.games_by_player[player].length === 0) {
                delete this.games_by_player[player];
            }
            return;
        }
    }
    countGamesForPlayer(player) {
        if (!this.games_by_player[player])  return 0;
        return this.games_by_player[player].length;
    }
    ok (str) {
        conn_log(str); 
    }
    err (str) {
        conn_log("ERROR: ", str); 
    }
    ping() {
        this.socket.emit('net/ping', {client: (new Date()).getTime()});
    }
    handlePong(data) {
        const now = Date.now();
        const latency = now - data.client;
        this.network_latency = latency;
        this.clock_drift = ((now-latency/2) - data.server);
    }
    terminate() {
        clearTimeout(this.connect_timeout);
        clearInterval(this.ping_interval);
        clearInterval(this.notification_connect_interval);
        clearInterval(this.corr_queue_interval);
    }
}

function request(method, host, port, path, data) {
    return new Promise((resolve, reject) => {
        if (config.DEBUG) {
            /* Keeping a backup of old copy syntax just in case.
            /  const noapidata = JSON.parse(JSON.stringify(data));
            /  noapidata.apikey = "hidden";*/

            // ES6 offers shallow copy syntax using spread
            const noapidata = { ...data, apikey: "hidden" };
            console.debug(method, host, port, path, noapidata);
        }

        let enc_data_type = "application/x-www-form-urlencoded";
        for (const k in data) {
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

        const options = {
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
            for (const k in headers) {
                options.headers[k] = headers[k];
            }
        }

        const req = (config.insecure ? http : https).request(options, (res) => { //test
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
}

function post(path, data, cb, eb) {
    return request("POST", config.host, config.port, path, data, cb, eb);
}

function api1(str) {
    return `/api/v1/${str}`;
}

function ignore() {}

function conn_log() {
    const arr = ["# "];
    let errlog = false;
    for (let i = 0; i < arguments.length; ++i) {
        const param = arguments[i];
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
}

function beforeRankedUnrankedGamesSpecial(before, extra, argName, special) {
    const isExtra = (extra !== "");
    if (argName.includes("unranked")) {
        return `${before}${extra}unranked games`; //ex: "for blitz unranked games"
    } else if (argName.includes("ranked")) {
        return `${before}${extra}ranked games`;   //ex: "for ranked games"
    } else if (isExtra) {
        return `${before}${extra}games`           //ex: "for correspondence games"
    } else if (special !== "") {
        return `${before}${special}games`         //ex: "from all games"
    } else {
        return "";
    }
}

function getArgNamesGRU(familyName) {
    return ["", "ranked", "unranked"].map( e => `${familyName}${e}` );
}

function rankToString(r) {
    const R = Math.floor(r);
    if (R >= 30)  return `${R - 30 + 1}d`; // R >= 30: 1 dan or stronger
    else          return `${30 - R}k`;     // R < 30:  1 kyu or weaker
}

function getRejectBanned(username, ranked) {
    return getReject(`You (${username}) are not allowed to play ${ranked}${ranked ? " " : ""}games against this bot.`)
}

function getReject(reason) {
    conn_log(reason);
    return { reject: true, msg: reason};
}

function getBooleansGeneralReject(nameF) {
    const msg = `${nameF} not allowed on this bot.`;
    conn_log(msg);
    return { reject: true, msg };
}

function get_r_u_arr_booleans(familyName, notificationRanked) {
    const [general, ranked, unranked] = getArgNamesGRU(familyName);
    // for the booleans "only" checks, we are trying to find any reason to reject
    // the challenge, so the general and ranked/unranked args dont conflict.
    // (unlike --minmaintimeranked 50 --minmaintime 300)

    return [ [general,  true],
             [ranked,   notificationRanked],
             [unranked, !notificationRanked]
           ];
}

function getBooleans_r_u_Reject(argName, nameF, ending) {
    const rankedUnranked = beforeRankedUnrankedGamesSpecial("for ", "", argName, "");
    const msg = `${nameF} not allowed on this bot ${rankedUnranked}${ending}.`;
    conn_log(msg);
    return { reject: true, msg };
}

function getBoardsizeNotSquareReject(argName, notificationWidth, notificationHeight) {
    const rankedUnranked = beforeRankedUnrankedGamesSpecial("for ", "", argName, "");
    conn_log(`boardsize ${notificationWidth}x${notificationHeight} `
             + `is not square, not allowed ${rankedUnranked}`);
    const msg = `Your selected board size ${notificationWidth}x${notificationHeight} `
                + `is not square, not allowed ${rankedUnranked}, `
                + `please choose a SQUARE board size (same width and `
                + `height), for example try 9x9 or 19x19}`;
    return { reject: true, msg };
}

function boardsizeSquareToDisplayString(boardsizeSquare) {
    return boardsizeSquare
    .toString()
    .split(',')
    .map(e => e.trim())
    .map(e => `${e}x${e}`)
    .join(', ');
}

function pluralFamilyStringToSingularString(plural) {
    const pluralArr = plural.split("unranked")[0]
                            .split("ranked")[0]
                            .split("");
    // for example "speedsranked" -> ["s", "p", "e", "e", "d", "s"]
    pluralArr.pop();
    // for example ["s", "p", "e", "e", "d", "s"] -> ["s", "p", "e", "e", "d"]

    return pluralArr.join("");  // for example ["s", "p", "e", "e", "d"] -> "speed"
}

function genericAllowedFamiliesReject(argName, notificationUnit) {
    const rankedUnranked = beforeRankedUnrankedGamesSpecial("for ", "", argName, "");
    const argFamilySingularString = pluralFamilyStringToSingularString(argName);
    // for example "speedsranked" -> "speed"
    let argValueString = config[argName];
    let notificationUnitConverted = notificationUnit;

    if (argFamilySingularString.includes("boardsize")) {
        argValueString = boardsizeSquareToDisplayString(config[argName]);
        // for example boardsizeSquareToDisplayString("9,13,19"]) : "9x9, 13x13, 19x19"
        notificationUnitConverted = boardsizeSquareToDisplayString(notificationUnit);
    } else if (argFamilySingularString.includes("komi") && (notificationUnit === null)) {
        notificationUnitConverted = "automatic";
    }
    conn_log(`${argFamilySingularString} ${rankedUnranked} `
             + `-${notificationUnitConverted}-, not in -${argValueString}- `);
    const msg = `${argFamilySingularString} -${notificationUnitConverted}- `
                + `is not allowed on this bot ${rankedUnranked}, please `
                + `choose one of these allowed ${argFamilySingularString}s `
                + `${rankedUnranked}: -${argValueString}-`;
    return { reject: true, msg };
}

function getMIBL(isMin) {
    if (isMin) {
        return { miniMaxi: "Minimum", incDec: "increase", belAbo: "below", lowHig: "low"  };
    } else {
        return { miniMaxi: "Maximum", incDec: "reduce",   belAbo: "above", lowHig: "high" };
    }
}

function getCheckedArgNameString(familyNameString, notificationRanked) {
    const argNameStrings = getArgNameStringsGRU(familyNameString);
    const [general, ranked, unranked] = argNameStrings;

    // for numbers, check for undefined: 0 is checked false but is a valid arg number to test against notif
    //
    if (config[unranked] !== undefined && !notificationRanked) {
        return unranked;
    } else if (config[ranked] !== undefined && notificationRanked) {
        return ranked;
    } else if (config[general] !== undefined) {
        return general;
    } else {
        // no valid arg to test, this happens when bot admin inputs no value and we
        // provide no default either (ex: minmaxrank, minmaxhandicap, etc.)
        return undefined;
    }
}


function checkNotifIsInMinMaxArgRange(arg, notif, isMin) {
    if (isMin) {
        return notif >= arg;
    } else {
        return notif <= arg;
    }
}

function getMinMaxRankRejectResult(nameF, notif, notificationRanked) {
    for (const minMax of ["min", "max"]) {
        const isMin = (minMax === "min");
        const argNameString = getCheckedArgNameString(`${minMax}rank`, notificationRanked);
        // if there is no arg to test (!argNameString), no need to check for reject,
        // also this allows to make sure config[argNameString] exists
        if (argNameString) {
            // convert rank "10k" to rank number so we can compare it
            const arg = config[argNameString];
            if (!checkNotifIsInMinMaxArgRange(arg, notif, isMin)) {
                const MIBL = getMIBL(isMin);
                const argToString = rankToString(arg);
                const notifConverted = rankToString(notif);
                const rankedUnranked = beforeRankedUnrankedGamesSpecial("for ", "", argNameString, "");
                conn_log(`${notifConverted} is ${MIBL.belAbo} ${MIBL.miniMaxi} ${nameF} `
                        + `${rankedUnranked} ${argToString}`);
                const msg = `${MIBL.miniMaxi} ${nameF} ${rankedUnranked} is ${argToString}, your ${nameF} `
                            + `is too ${MIBL.lowHig}, you may try try changing the ranked/unranked setting.`;
                return { reject: true, msg };
            }
        }
    }
}

function getBlitzLiveCorr(notificationTSpeed) {
    if (notificationTSpeed === "correspondence") return "corr";
    return notificationTSpeed;
}

function getMinMaxHandicapPeriodsRejectResult(handicapPeriodsBLC, nameF, notif, isFakeHandicap, blitzLiveCorrCorrected, notificationRanked) {
    for (const minMax of ["min", "max"]) {
        const isMin = (minMax === "min");
        const argNameString = getCheckedArgNameString(`${minMax}${handicapPeriodsBLC}`, notificationRanked);
        // if there is no arg to test (!argNameString), no need to check for reject,
        // also this allows to make sure config[argNameString] exists
        if (argNameString) {
            const arg = config[argNameString];
            if (!checkNotifIsInMinMaxArgRange(arg, notif, isMin)) {
                const MIBL = getMIBL(isMin);
                const rankedUnranked = beforeRankedUnrankedGamesSpecial("for ", blitzLiveCorrCorrected, argNameString, "");
                const suggestion = ", or try changing the ranked/unranked setting.";
                if (handicapPeriodsBLC === "handicap") {
                    if (isMin && notif === 0 && arg > 0) {
                        conn_log(`No ${rankedUnranked} (handicap games only)`);
                        const msg = `This bot does not play even games ${rankedUnranked}, please manually select the `
                                    + `number of ${nameF} in -custom handicap-: minimum is ${arg} ${nameF}${suggestion}`;
                        return { reject: true, msg };
                    } else if (!isMin && notif > 0 && arg === 0) {
                        conn_log(`No ${rankedUnranked} (even games only)'`);
                        const msg = `This bot does not play ${rankedUnranked}, please choose handicap -none- `
                                    + `(0 handicap stones)${suggestion}`;
                        return { reject: true, msg };
                    } else if (isFakeHandicap) {
                        conn_log(`Automatic handicap ${rankedUnranked} was set to ${notif} stones, but `
                                    + `${MIBL.miniMaxi} handicap ${rankedUnranked} is ${arg} stones`);
                        const msg = `Automatic handicap ${rankedUnranked} was automatically set to ${notif} `
                                    + `stones based on rank difference between you and this bot,\nBut ${MIBL.miniMaxi} `
                                    + `handicap ${rankedUnranked} is ${arg} stones \nPlease ${MIBL.incDec} `
                                    + `the number of handicap stones in -custom handicap-.`;
                        return { reject: true, msg };
                    }
                }
                // if no specific reject, fall back to generic reject
    
                conn_log(`${notif} is ${MIBL.belAbo} ${MIBL.miniMaxi} ${handicapPeriodsBLC} ${rankedUnranked} ${arg}`);
                const msg = `${MIBL.miniMaxi} ${nameF} ${rankedUnranked} ${arg}, please ${MIBL.incDec} `
                            + `the number of ${nameF}.`;
                return { reject: true, msg };
            }
        }
    }
}

function timespanToDisplayString(timespan) {
    const ss = timespan % 60;
    const mm = Math.floor(timespan / 60 % 60);
    const hh = Math.floor(timespan / (60*60) % 24);
    const dd = Math.floor(timespan / (60*60*24));
    const text = ["days", "hours", "minutes", "seconds"];
    return [dd, hh, mm, ss]
    .map((e, i) => e === 0 ? "" : `${e} ${text[i]}`)
    .filter(e => e !== "")
    .join(" ");
}

function getTimecontrolArrsMainPeriodTime(mpt, notificationT) {
    if (mpt.includes("maintime")) {
        // "none" and "simple" don't have a maintime, skip the maintime reject
        return [["fischer", "Initial Time", notificationT.initial_time],
                ["fischer", "Max Time", notificationT.max_time],
                ["byoyomi", "Main Time", notificationT.main_time],
                ["canadian", "Main Time", notificationT.main_time],
                ["absolute", "Total Time", notificationT.total_time]];
    } else {
        // - "none" and "absolute" don't have a periodtime, skip the periodtime reject.
        // - for canadian periodtime, notification is for N stones
        return [["fischer", "Increment Time", notificationT.time_increment],
                ["byoyomi", "Period Time", notificationT.period_time],
                ["canadian", `Period Time for all the ${notificationT.stones_per_period} stones`, notificationT.period_time],
                ["simple", "Time per move", notificationT.per_move]];
    }
}

function getMinMaxMainPeriodTimeRejectResult(mainPeriodTimeBLC, notificationT, notificationRanked) {
    const timecontrolArrs = getTimecontrolArrsMainPeriodTime(mainPeriodTimeBLC, notificationT);
    for (const timecontrolArr of timecontrolArrs) {
        const [timecontrolName, timecontrolDescr, timecontrolNotif] = timecontrolArr;
        if (notificationT.time_control === timecontrolName) {
            for (const minMax of ["min", "max"]) {
                const isMin = (minMax === "min");
                const argNameString = getCheckedArgNameString(`${minMax}${mainPeriodTimeBLC}`, notificationRanked);
                // if there is no arg to test (!argNameString), no need to check for reject,
                // also this allows to make sure config[argNameString] exists
                if (argNameString) {
                    let arg = config[argNameString];
                    let endingSentence = "";
                    if ((notificationT.time_control === "canadian") && (mainPeriodTimeBLC.includes( "periodtime"))) {
                        // - for canadian periodtimes, notificationT.period_time is provided by server for N stones, but
                        // arg is inputted by botadmin for 1 stone, while notification is for X stones:
                        // multiply arg by the number of stones per period, so we can compare it against notification.
                        // - also, this allows to display minmax periodtime arg and notif in messages for all the X stones.
                        // - also, use multiply to raise arg rather than division to reduce notif to 1 stone, to avoid binary division
                        // loss of precision.
                        arg *= notificationT.stones_per_period;
                        endingSentence = ", or change the number of stones per period";
                    }
                    if (!checkNotifIsInMinMaxArgRange(arg, timecontrolNotif, isMin)) {
                        const argToString = timespanToDisplayString(arg); // ex: "1 minutes"
                        const MIBL = getMIBL(isMin);
                        const rankedUnranked = beforeRankedUnrankedGamesSpecial("for ", `${notificationT.speed} `, argNameString, "");
                        conn_log(`${timespanToDisplayString(timecontrolNotif)} is ${MIBL.belAbo} ${MIBL.miniMaxi} `
                                + `${timecontrolDescr} ${rankedUnranked} in ${timecontrolName} ${argToString}`);
                        const msg = `${MIBL.miniMaxi} ${timecontrolDescr} ${rankedUnranked} in ${timecontrolName} `
                                    + `is ${argToString}, please ${MIBL.incDec} ${timecontrolDescr}${endingSentence}.`;
                        return { reject : true, msg };
                        // example : "Minimum (Main/Period) Time for blitz ranked games
                        //            in byoyomi is 1 minutes, please increase (Main/Period) Time."
                    }
                }
            }
        }
    }
}

exports.Connection = Connection;
