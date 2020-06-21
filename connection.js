// vim: tw=120 softtabstop=4 shiftwidth=4

const http = require('http');
const https = require('https');
const querystring = require('querystring');

const { get_r_u } = require('./utils/get_r_u');
const { get_r_u_sentences } = require('./utils/get_r_u_sentences');

let config;
const console = require('./console').console;
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
    constructor(io_client, myConfig) {
        config = myConfig;
        const prefix = (config.insecure ? `http://` : `https://`) + `${config.host}:${config.port}`;

        conn_log(`Connecting to ${prefix}`);
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

    // Make sure challenge is checkable, else don't check it.
    //
    checkChallengeSanityChecks(notification) {

        // TODO: add all sanity checks here of all unhandled notifications

        // notification sample as of may 2020
        //{"id":"785246:6c6a506f-3af8-4e5d-afca-1dc8d592b7a8","type":"challenge","player_id":1,
        //"timestamp":1590353535,"read_timestamp":0,"read":0, "aux_delivered":0,"game_id":1,"challenge_id":1,
        //"user":{"id":1,"country":"un","username":"Some User",
        //"icon_url":"https://secure.gravatar.com/avatar/ed9162b40504d7f64cfe3547c232c665?s=32&d=retro",
        //"ratings":{"overall":{"rating":2451.209718473043,"deviation":118.76556422774001,"volatility":0.06297489852992705,"games_played":613}},
        //"ui_class":"timeout","professional":false,"rating":"1009.541","ranking":33.096893588618975},
        //"rules":"chinese","ranked":true,"aga_rated":false,"disable_analysis":false,"handicap":0,"komi":null,
        //"time_control":{"system":"byoyomi","time_control":"byoyomi","speed":"live","pause_on_weekends":false,"main_time":1200,"period_time":30,"periods":5},
        //"challenger_color":"automatic","width":19,"height":19};*/

        // do not check everything, only the keys we need.
        const notificationKeys = ["user", "rules", "ranked", "handicap", "komi", "time_control", "width", "height"];
        const resultNotificationKeys = getCheckedKeysInObjRejectResult(notificationKeys, notification);
        if (resultNotificationKeys) return resultNotificationKeys;

        const notificationKeysUser = ["id", "username", "professional", "ratings", "ranking"];
        const resultNotificationKeysUser = getCheckedKeysInObjRejectResult(notificationKeysUser, notification.user);
        if (resultNotificationKeysUser) return resultNotificationKeysUser;

        const notificationKeysUserRatings = ["overall"];
        const resultNotificationKeysUserRatings = getCheckedKeysInObjRejectResult(notificationKeysUserRatings, notification.user.ratings);
        if (resultNotificationKeysUserRatings) return resultNotificationKeysUserRatings;

        const notificationKeysUserRatingsOverall = ["games_played"];
        const resultNotificationKeysUserRatingsOverall = getCheckedKeysInObjRejectResult(notificationKeysUserRatingsOverall, notification.user.ratings.overall);
        if (resultNotificationKeysUserRatingsOverall) return resultNotificationKeysUserRatingsOverall;

        const notificationKeysTimecontrol = ["time_control", "speed", "pause_on_weekends"];
        const resultNotificationKeysTimecontrol = getCheckedKeysInObjRejectResult(notificationKeysTimecontrol, notification.time_control);
        if (resultNotificationKeysTimecontrol) return resultNotificationKeysTimecontrol;

        processCheckedTimeSettingsKeysRejectResult("byoyomi"  , ["main_time", "periods", "period_time"], notification.time_control);
        processCheckedTimeSettingsKeysRejectResult("canadian" , ["main_time", "stones_per_period", "period_time"], notification.time_control);
        processCheckedTimeSettingsKeysRejectResult("fischer"  , ["initial_time", "max_time", "time_increment"], notification.time_control);
        processCheckedTimeSettingsKeysRejectResult("simple"   , ["per_move"], notification.time_control);
        processCheckedTimeSettingsKeysRejectResult("absolute" , ["total_time"], notification.time_control);
        // time control "none" has no time settings key, no need to check it.

        // unknown speed "turbo" makes --minmaintimeturbo uncheckable.
        const knownSpeeds = ["blitz", "live", "correspondence"];
        if (!knownSpeeds.includes(notification.time_control.speed)) {
            err(`Unknown speed ${notification.time_control.speed}.`);
            const msg = `Unknown speed ${notification.time_control.speed}`
                        + `, cannot check challenge, please contact my bot admin.`;
            return { reject: true, msg };
        }

        // unknown time control "penalty" is undefined in timesObj["penalty"].maintime, uncheckable.
        const knownTimecontrols = ["fischer", "byoyomi", "canadian", "simple", "absolute", "none"];
        if (!knownTimecontrols.includes(notification.time_control.time_control)) {
            err(`Unknown time control ${notification.time_control.time_control}.`);
            const msg = `Unknown time control ${notification.time_control.time_control}`
                        + `, cannot check challenge, please contact my bot admin.`;
            return { reject: true, msg };
        }

        // Sanity check: OGS enforces rules to be chinese regardless of user's choice.
        if (!notification.rules.includes("chinese")) {
            err(`Unhandled rules: ${notification.rules}`);
            const msg = `The ${notification.rules} rules are not allowed on this bot, `
                        + `please choose allowed rules, for example chinese rules.`;
            return { reject: true, msg };
        }

        return { reject: false }; // OK !

    }
    // Check challenge user is acceptable, else don't mislead user
    //
    checkChallengeUser(notification, r_u) {

        if (config[r_u].bannedusernames.banned[notification.user.username]) {
            return getBannedGroupReject("bannedusernames", notification.user.username, r_u);
        }
        if (config[r_u].banneduserids.banned[notification.user.id]) {
            return getBannedGroupReject("banneduserids", notification.user.id, r_u);
        }

        if (!notification.user.professional && config[r_u].proonly) {
            const beginning = "Games against non-professionals are";
            return getBooleansRUReject("proonly", r_u, beginning, true);
        }

        const notifGamesPlayed = notification.user.ratings.overall.games_played;
        if (config[r_u].mingamesplayed !== undefined && !checkNotifIsInMinMaxArgRange(config[r_u].mingamesplayed, notifGamesPlayed, true)) {
            return getMingamesplayedReject(notifGamesPlayed, r_u);
        }

        const resultMinRank = getMinMaxRankRejectResult("minrank", notification.user.ranking, notification.user.professional, r_u);
        if (resultMinRank) return resultMinRank;

        const resultMaxRank = getMinMaxRankRejectResult("maxrank", notification.user.ranking, notification.user.professional, r_u);
        if (resultMaxRank) return resultMaxRank;

        return { reject: false }; // OK !

    }
    // Check bot is available, else don't mislead user
    //
    checkChallengeBot(notification) {

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
    // Check some booleans allow a game ("nopause" is in game.js, not here)
    //
    /*checkChallengeBooleans(notification, r_u) {

        if (config.rankedonly && !notification.ranked) {
            return getBooleansGeneralReject("Unranked games are");
        }
        if (config.unrankedonly && notification.ranked) {
            return getBooleansGeneralReject("Ranked games are");
        }

        if (notification.pause_on_weekends) {
            const beginning = "Pause on week-ends is";
            const ending    = "";
            const resultNoPauseWeekends = getBooleansGRURejectResult("nopauseonweekends", notification.ranked, beginning, ending);
            if (resultNoPauseWeekends) return resultNoPauseWeekends;
        }

        return { reject: false }; // OK !

    }
    // Check challenge allowed group options are allowed
    //
    checkChallengeAllowedGroup(notification, r_u) {

        // only square boardsizes, except if all is allowed
        if (notification.width !== notification.height) {
            if (config.boardsizes && !config.boardsizesranked && !config.boardsizesunranked && !config.allow_all_boardsizes) {
                return getBoardsizeNotSquareReject("boardsizes", notification.width, notification.height);
            }
            if (config.boardsizesranked && notification.ranked && !config.allow_all_boardsizes_ranked) {
                return getBoardsizeNotSquareReject("boardsizesranked", notification.width, notification.height);
            }
            if (config.boardsizesunranked && !notification.ranked && !config.allow_all_boardsizes_unranked) {
                return getBoardsizeNotSquareReject("boardsizesunranked", notification.width, notification.height);
            }
        }
        
        // if square, check if square board size is allowed
        const resultBoardsizes = getAllowedGroupRejectResult("boardsizes", "Board size", notification.width, notification.ranked);
        if (resultBoardsizes) return resultBoardsizes;

        const resultKomis = getAllowedGroupRejectResult("komis", "Komi", notification.komi, notification.ranked);
        if (resultKomis) return resultKomis;

        const resultSpeeds = getAllowedGroupRejectResult("speeds", "Speed", notification.time_control.speed, notification.ranked);
        if (resultSpeeds) return resultSpeeds;

        const resultTimecontrols = getAllowedGroupRejectResult("timecontrols", "Time control", notification.time_control.time_control, notification.ranked);
        if (resultTimecontrols) return resultTimecontrols;

        return { reject: false }; // OK !

    }

    // Check challenge handicap is allowed
    //
    checkChallengeHandicap(notification, r_u) {

        if (notification.handicap === -1) {
            const beginning = "-Automatic- handicap is";
            const ending    = ", please manually select the number of handicap stones in -custom- handicap";
            const resultNoAutoHandicap = getBooleansGRURejectResult("noautohandicap", notification.ranked, beginning, ending);
            if (resultNoAutoHandicap) return resultNoAutoHandicap;
        }

        const resultHandicap = getMinMaxHandicapRejectResult(notification.handicap, notification.user.ranking, notification.ranked);
        if (resultHandicap) return resultHandicap;

        return { reject: false };  // Ok !

    }
    // Check challenge time settings are allowed
    //
    checkChallengeTimeSettings(notification, r_u) {


        // time control "none" has no maintime, no periods number, no periodtime, no need to check reject.
        if (notification.time_control.time_control !== "none") {
            const resultMaintime = getMinMaxMainPeriodTimeRejectResult("maintime", notification.time_control, notification.ranked);
            if (resultMaintime) return resultMaintime;
    
            // "fischer", "canadian", "simple", "absolute", don't have a periods number,
            // arg compared to undefined notificationT.periods will always return false, thus
            // always rejecting: don't check it.
            //
            if (notification.time_control.time_control === "byoyomi") {
                const resultPeriods = getMinMaxPeriodsRejectResult("periods", notification.time_control, notification.ranked);
                if (resultPeriods) return resultPeriods;
            }
            
            const resultPeriodtime = getMinMaxMainPeriodTimeRejectResult("periodtime", notification.time_control, notification.ranked);
            if (resultPeriodtime) return resultPeriodtime;
        }


        return { reject: false };  // Ok !

    }*/
    // Check challenge entirely, and return reject status + optional error msg.
    //
    checkChallenge(notification) {

        const r_u = get_r_u(notification.ranked);

        for (const test of [this.checkChallengeSanityChecks,
                           this.checkChallengeUser,
                           this.checkChallengeBot,
                           //this.checkChallengeBooleans,
                           //this.checkChallengeAllowedGroup,
                           //this.checkChallengeHandicap,
                           //this.checkChallengeTimeSettings
                           ]) {
            const result = test.bind(this)(notification, r_u);
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
                 + `(${rankToString(notification.user.ranking, notification.user.professional)})  `
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
    hide() {
        this.socket.emit('bot/hidden', true);
    }
    unhide() {
        this.socket.emit('bot/hidden', false);
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

function err(str) {
    conn_log("ERROR: ", str); 
}

function rankToString(r, userIsPro) {
    const R = Math.floor(r);

    if (userIsPro) return `${R - 37 + 1}p=${R - 30 + 1}d`; // pros on OGS start at 8d = 1p
    if (R >= 30)   return `${R - 30 + 1}d`; // 1 dan or stronger
    else           return `${30 - R}k`;     // 1 kyu or weaker
}

function getCheckedKeyInObjReject(k) {
    err(`Missing key ${k}.`);
    const msg = `Missing key ${k}, cannot check challenge, please contact my bot admin.`;
    return { reject: true, msg };
}

function getCheckedKeysInObjRejectResult(keys, obj) {
    for (const k of keys) {
        if (!(k in obj)) {
            return getCheckedKeyInObjReject(k);
        }
    }
}

function processCheckedTimeSettingsKeysRejectResult(timecontrol, keys, notif) {
    if (notif.time_control === timecontrol) {
        const resultNotificationKeysTimeSettings = getCheckedKeysInObjRejectResult(keys, notif);
        if (resultNotificationKeysTimeSettings) return resultNotificationKeysTimeSettings;
    }
}

function checkRankedArgSameRuleAsUnrankedArgBannedGroup(optionName, notif) {
    const rankedArg = config.ranked[optionName].banned[notif];
    const unrankedArg = config.unranked[optionName].banned[notif];

    return (rankedArg === unrankedArg);
}

function checkRankedArgSameRuleAsUnrankedArgGenericOption(optionName) {
    const rankedArg = config.ranked[optionName];
    const unrankedArg = config.unranked[optionName];

    return (rankedArg === unrankedArg);
}

function checkRankedArgSameRuleAsUnrankedArgMinMaxOption(optionName, notif, isMin) {
    const rankedArg = config.ranked[optionName];
    const unrankedArg = config.unranked[optionName];

    // undefined or other invalid values are tested false against any number comparison
    if (!isFinite(rankedArg) || !isFinite(unrankedArg)) {
        return false;
    }

    return (!checkNotifIsInMinMaxArgRange(rankedArg, notif, isMin) === !checkNotifIsInMinMaxArgRange(unrankedArg, notif, isMin));
}

/*function checkRankedArgSameRuleAsUnrankedArgAllowedGroup(optionName, notif) {
    const rankedArg = config.ranked[optionName].allowed[notif];
    const unrankedArg = config.unranked[optionName].allowed[notif];

    return (rankedArg === unrankedArg);
}*/

function getReject(reason) {
    return { reject: true, reason };
}

function getBannedGroupReject(optionName, notif, r_u) {
    const banType = optionName.split("banneduser")[1].slice(0, -1);
    const rankedArgSameRuleAsUnrankedArg = checkRankedArgSameRuleAsUnrankedArgBannedGroup(optionName, notif);
    const r_u_sentences = get_r_u_sentences(rankedArgSameRuleAsUnrankedArg, r_u);

    conn_log(`user ${banType} ${notif} is banned${r_u_sentences.from_r_u_games}.`);
    return getReject(`You (user ${banType} ${notif}) are banned${r_u_sentences.from_r_u_games} on this bot${r_u_sentences.alternative}.`);
}

function getBooleansRUReject(optionName, r_u, beginning, rejectIsImmutable) {
    const rankedArgSameRuleAsUnrankedArg = checkRankedArgSameRuleAsUnrankedArgGenericOption(optionName);
    const r_u_sentences = get_r_u_sentences(rankedArgSameRuleAsUnrankedArg, r_u);
    
    const suggestion = (rejectIsImmutable ? r_u_sentences.alternative : r_u_sentences.alternative);

    const reason = `${beginning} not allowed on this bot${r_u_sentences.for_r_u_games}${suggestion}.`;
    conn_log(`${beginning} not allowed on this bot${r_u_sentences.for_r_u_games} (${optionName})`);
    return getReject(reason);
}

function getMingamesplayedReject(notif, r_u) {
    const optionName = "mingamesplayed";
    const isMin = true;

    const rankedArgSameRuleAsUnrankedArg = checkRankedArgSameRuleAsUnrankedArgMinMaxOption(optionName,  notif, isMin);
    const r_u_sentences = get_r_u_sentences(rankedArgSameRuleAsUnrankedArg, r_u);

    const arg = config[r_u].mingamesplayed;

    conn_log(`Number of ranked games played by this user is ${notif}, it is below minimum`
             + `${r_u_sentences.for_r_u_games} ${arg}, user is too new (${optionName})`);
    const reason = `It looks like your account is still new on OGS, this bot will be open to`
                + ` your user account${r_u_sentences.for_r_u_games} after you play more games.`
                + ` You need ${arg - notif} more ranked ${(arg - notif) === 1 ? 'game'  : 'games'}${r_u_sentences.alternative}.`;
    return getReject(reason);
}

/*function getBooleansNonRUReject(nameF) {
    const msg = `${nameF} not allowed on this bot.`;
    conn_log(msg);
    return { reject: true, msg };
}

function getBoardsizeNotSquareReject(argName, notificationWidth, notificationHeight) {
    const rankedUnranked = getForFromBLCRankedUnrankedGames("for ", "", argName, "");
    conn_log(`boardsize ${notificationWidth}x${notificationHeight} `
             + `is not square, not allowed ${rankedUnranked}`);
    const msg = `Board size ${notificationWidth}x${notificationHeight} is not square`
                + `, not allowed${rankedUnranked}.\nPlease choose a SQUARE board size`
                + ` (same width and height), for example try 9x9 or 19x19.`;
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

function getAllowedGroupNotifToString(argName, notif) {
    if (argName.includes("boardsizes")) {
        return boardsizeSquareToDisplayString(notif);
    }
    if (argName.includes("komis") && (notif === null)) {
        return "automatic";
    } else {
        return notif;
    }
}

function getAllowedGroupReject(argName, nameF, notif) {
    const forRankedUnrankedGames = getForFromBLCRankedUnrankedGames("for ", "", argName, "");

    const arg = config[argName];
    const argToString = (argName.includes("boardsizes") ? boardsizeSquareToDisplayString(arg) : arg);
    const notifToString = getAllowedGroupNotifToString(argName, notif);

    conn_log(`${nameF} ${forRankedUnrankedGames}is ${notifToString}, not in ${argToString} (${argName}).`);
    const msg = `${nameF} ${notifToString} is not allowed on this bot${forRankedUnrankedGames}`
                + `, please choose one of these allowed ${nameF}s${forRankedUnrankedGames}:\n${argToString}.`;
    return { reject: true, msg };
}

function getAllowedGroupRejectResult(optionName, nameF, notif, notificationRanked) {
    const argNames = getArgNamesGRU(optionName);
    const [general, ranked, unranked] = argNames;
    const [general_underscored, ranked_underscored, unranked_underscored] = getArgNamesUnderscoredGRU(optionName);

    if (config[general] && !config[ranked] && !config[unranked] && !config[`allow_all_${general_underscored}`] && !config[`allowed_${general_underscored}`][notif]) {
        return getAllowedGroupReject(general, nameF, notif);
    }
    if (config[ranked] && notificationRanked && !config[`allow_all_${ranked_underscored}`] && !config[`allowed_${ranked_underscored}`][notif]) {
        return getAllowedGroupReject(ranked, nameF, notif);
    }
    if (config[unranked] && !notificationRanked && !config[`allow_all_${unranked_underscored}`] && !config[`allowed_${unranked_underscored}`][notif]) {
        return getAllowedGroupReject(unranked, nameF, notif);
    }
}*/

function checkIsMin(optionName) {
    return (optionName.slice(0,3) === "min");
}

function checkNotifIsInMinMaxArgRange(arg, notif, isMin) {
    if (isMin) {
        return notif >= arg;
    } else {
        return notif <= arg;
    }
}

function getMIBL(isMin) {
    if (isMin) {
        return { miniMaxi: "Minimum", incDec: "increase", belAbo: "below" };
    } else {
        return { miniMaxi: "Maximum", incDec: "reduce",   belAbo: "above" };
    }
}

function getFixedFirstNameS(nameS, timeControlSentence) {
    if (timeControlSentence.includes("canadian")) {
        return nameS;
    }
    if (nameS.includes("the ")) {
        return nameS.split(" ")
                    .filter( (e) => (e !== "the" ) )
                    .join(" ");
    } else {
        return nameS;
    }
}

function getMinMaxGenericMsg(MIBL, nameS, for_r_u_games, timeControlSentence, argToString) {
    const fixedFirstNameS = getFixedFirstNameS(nameS, timeControlSentence);

    return `${MIBL.miniMaxi} ${fixedFirstNameS}${for_r_u_games}${timeControlSentence} is ${argToString}`;
}

function getMinMaxReject(argToString, notifToString, notif, isMin, r_u,
                         timeControlSentence, optionName, nameS, middleSentence) {
    const rankedArgSameRuleAsUnrankedArg = checkRankedArgSameRuleAsUnrankedArgMinMaxOption(optionName, notif, isMin);
    const r_u_sentences = get_r_u_sentences(rankedArgSameRuleAsUnrankedArg, r_u);

    const MIBL = getMIBL(isMin);

    conn_log(`${notifToString} is ${MIBL.belAbo} ${MIBL.miniMaxi} ${nameS}${r_u_sentences.for_r_u_games}${timeControlSentence} ${argToString} (${optionName}).`);

    let reason = getMinMaxGenericMsg(MIBL, nameS, r_u_sentences.for_r_u_games, timeControlSentence, argToString);
    const optionNameIsRank = (optionName.slice(3) === "rank");
    if (optionNameIsRank) {
        reason += `${r_u_sentences.alternative}.`;
    } else {
        reason += `, please ${MIBL.incDec} ${nameS}${middleSentence}${r_u_sentences.suggestion}.`;
    }

    return getReject(reason);
}

function getMinMaxRankRejectResult(optionName, notif, userIsPro, r_u) {
    const isMin = checkIsMin(optionName);
    const arg = config[r_u][optionName];

    // check undefined specifically to avoid testing false valid args such as 0 to test against notif
    if (arg !== undefined) {
        if (!checkNotifIsInMinMaxArgRange(arg, notif, isMin)) {
            return getMinMaxReject(rankToString(arg, userIsPro), rankToString(notif, userIsPro), notif, isMin, r_u,
                                   "", optionName, "rank", "");
        }
    }
}

/*function getBooleansGRURejectResult(argName, notificationRanked, beginning, ending) {
    const [general, ranked, unranked] = getArgNamesGRU(argName);

    if (config[general] && !config[ranked] && !config[unranked]) {
        return getBooleansGRUReject("", beginning, ending);
    }
    if (config[ranked] && notificationRanked) {
        return getBooleansGRUReject("ranked", beginning, ending);
    }
    if (config[unranked] && !notificationRanked) {
        return getBooleansGRUReject("unranked", beginning, ending);
    }
}

function getHandicapMiddleSentence(isMin, notif, arg) {
    if (!isMin && notif > 0 && arg === 0) {
        return " (no handicap games)";
    } else {
        return "";
    }
}

function getMinMaxHandicapRejectResult(notif, notificationRanked) {
    for (const minMax of ["min", "max"]) {
        const isMin = (minMax === "min");

        if (argName) {
            const arg = config[argName];
            if (!checkNotifIsInMinMaxArgRange(arg, notif, isMin)) {
                const middleSentence = getHandicapMiddleSentence(isMin, notif, arg);
                return getMinMaxReject(arg, notif, isMin, r_u
                                       "", argName, "the number of handicap stones", middleSentence);
            }
        }
    }
}

function getBlitzLiveCorr(speed) {
    if (speed === "correspondence") {
        return "corr";
    }
    return speed;
}

function getMinMaxPeriodsRejectResult(periodsName, notificationT, notificationRanked) {
    const blitzLiveCorr = getBlitzLiveCorr(notificationT.speed);
    const notif         = notificationT.periods;
    for (const minMax of ["min", "max"]) {
        const isMin = (minMax === "min");

        if (argName) {
            const arg = config[argName];
            if (!checkNotifIsInMinMaxArgRange(arg, notif, isMin)) {
                return getMinMaxReject(arg, notif, isMin, r_u,
                                       ` in ${notificationT.time_control}`, argName, "the number of periods", "");
            }
        }
    }
}

function getTimecontrolObjsMainPeriodTime(mainPeriodTime, notificationT ) {
    // for canadian, periodtime notif is for all the N stones.
    const timesObj = { fischer:  { maintime:   [{ name: "Initial Time"  , notif: notificationT.initial_time },
                                                { name: "Max Time"      , notif: notificationT.max_time }],
                                   periodtime: [{ name: "Increment Time", notif: notificationT.time_increment }]
                                 },
                       byoyomi:  { maintime:   [{ name: "Main Time"     , notif: notificationT.main_time }],
                                   periodtime: [{ name: "Period Time"   , notif: notificationT.period_time }]
                                 },
                       canadian: { maintime:   [{ name: "Main Time"     , notif: notificationT.main_time }],
                                   periodtime: [{ name: `Period Time for all the ${notificationT.stones_per_period} stones`, notif: notificationT.period_time }]
                                 },
                       simple:   { periodtime: [{ name: "Time per move" , notif: notificationT.per_move }]
                                 },
                       absolute: { maintime:   [{ name: "Total Time"    , notif: notificationT.total_time }]
                                 },
                     };

    return timesObj[notificationT.time_control][mainPeriodTime];
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

function getMinMaxMainPeriodTimeRejectResult(mainPeriodTime, notificationT, notificationRanked) {
    const blitzLiveCorr   = getBlitzLiveCorr(notificationT.speed);
    const timecontrolObjs = getTimecontrolObjsMainPeriodTime(mainPeriodTime, notificationT);

    if (timecontrolObjs) {
        for (const minMax of ["min", "max"]) {
            const isMin = (minMax === "min");

            if (argName) {
                let arg = config[argName];
                let middleSentence = "";
                if ((notificationT.time_control === "canadian") && (mainPeriodTime.includes("periodtime"))) {
                    // - for canadian periodtimes, notificationT.period_time is provided by server for N stones, but
                    // arg is inputted by botadmin for 1 stone: multiply arg by the number of stones per period, so that
                    // we can compare it against notification.
                    // - also, use multiply to raise arg, to avoid binary division loss of precision.
                    arg *= notificationT.stones_per_period;
                    middleSentence = ", or change the number of stones per period";
                }
                for (const timecontrolObj of timecontrolObjs) {
                    const notif = timecontrolObj.notif;
                    if (!checkNotifIsInMinMaxArgRange(arg, notif, isMin)) {
                        return getMinMaxReject(timespanToDisplayString(arg), timespanToDisplayString(notif), isMin, r_u,
                                               ` in ${notificationT.time_control}`, argName, timecontrolObj.name, middleSentence);
                    }
                }
            }
        }
    }
}
*/

exports.Connection = Connection;
