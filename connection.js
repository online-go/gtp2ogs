// vim: tw=120 softtabstop=4 shiftwidth=4

const querystring = require('querystring');

const io = require('socket.io-client');
const http = require('http');
const https = require('https');
const sprintf = require('sprintf-js').sprintf;

const console = require('./console').console;
const config = require('./config');
const Game = require('./game').Game;

/****************/
/** Connection **/
/****************/
const ignorable_notifications = {
    'gameStarted': true,
    'gameEnded': true,
    'gameDeclined': true,
    'gameResumedFromStoneRemoval': true,
    'tournamentStarted': true,
    'tournamentEnded': true,
};

class Connection {
    constructor(io_client) {{{
        const prefix = (config.insecure ? 'http://' : 'https://') + config.host + ':' + config.port;

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
                    console.error(`ERROR: Bot account is unknown to the system: ${config.username}`);
                    process.exit();
                }
                conn_log(`Bot is username: ${config.username}`);
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
            if (this['on_' + notification.type]) {
                this['on_' + notification.type](notification);
            }
            else if (!(notification.type in ignorable_notifications)) {
                console.log("Unhandled notification type: ", notification.type, notification);
                this.deleteNotification(notification);
            }
        });

        socket.on('active_game', (gamedata) => {
            if (config.DEBUG) {
                conn_log("active_game:", JSON.stringify(gamedata));
            }

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

                    if (config.DEBUG) {
                        conn_log(gamedata.id, "active_game phase === finished");
                    }

                    /* XXX We want to disconnect right away here, but there's a game over race condition
                    /      on server side: sometimes /gamedata event with game outcome is sent after
                    /      active_game, so it's lost since there's no game to handle it anymore...
                    /      Work around it with a timeout for now.*/
                    if (!this.connected_games[gamedata.id].disconnect_timeout) {
                        if (config.DEBUG) {
                            console.log("Starting disconnect Timeout in Connection active_game for " + gamedata.id);
                        }
                        this.connected_games[gamedata.id].disconnect_timeout =
                            setTimeout(() => {  this.disconnectFromGame(gamedata.id);  }, 1000);
                    }
                }
                // Don't connect to finished games.
                return;
            }

            // Don't connect if it is not our turn.
            if (gamedata.player_to_move !== this.bot_id) {
                return;
            }

            // Set up the game so it can listen for events.
            this.connectToGame(gamedata.id);
        });
    }}}
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
            if (config.DEBUG) {
                conn_log("Connected to game", game_id, "already");
            }
            return this.connected_games[game_id];
        }

        return this.connected_games[game_id] = new Game(this, game_id);
    }
    disconnectFromGame(game_id) {
        if (config.DEBUG) {
            conn_log("disconnectFromGame", game_id);
        }
        if (game_id in this.connected_games) {
            this.connected_games[game_id].disconnect();
            delete this.connected_games[game_id];
        }
    }
    disconnectIdleGames() {
        if (config.DEBUG) {
            conn_log("Looking for idle games to disconnect");
        }
        for (const game_id in this.connected_games) {
            const state = this.connected_games[game_id].state;
            if (state === null) {
                if (config.DEBUG) {
                    conn_log("No game state, not checking idle status for", game_id);
                }
                continue;
            }
            const idle_time = Date.now() - state.clock.last_move;
            if ((state.clock.current_player !== this.bot_id) && (idle_time > config.timeout)) {
                if (config.DEBUG) {
                    conn_log("Found idle game", game_id, ", other player has been idling for", idle_time, ">", config.timeout);
                }
                this.disconnectFromGame(game_id);
            }
        }
    }
    dumpStatus() {
        for (const game_id in this.connected_games) {
            const game = this.connected_games[game_id];
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
            const idle_time = (Date.now() - game.state.clock.last_move) / 1000;
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
            this.socket.emit('notification/connect', this.auth({}), (x) => {
            conn_log(x); });
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
    checkChallengeMandatory(notification, r_u_strings) {

        // check user is acceptable first, else don't mislead user (is professional is in booleans below, not here):
        for (const uid of ["username", "id"]) {
            if (!ObjectIsEmpty(config.check_comma_separated_RU(notification.user[uid], r_u_strings.r_u, "bans"))) {
                const connLog = `${uid} ${notification.user[uid]} is banned ${r_u_strings.for_r_u_games}`;
                const reject = `You (${uid} ${notification.user[uid]}) are banned `
                               + `${r_u_strings.from_r_u_games} on this bot by bot admin, `
                               + `you may try changing the ranked/unranked setting`; 
                return { connLog, reject };
            }
        }

        const check_min_max = config.check_min_max_args_RU(notif, notificationRanked, "rank", "rank");
        if (!ObjectIsEmpty(check_min_max)) {
            return getMinMaxRejectMessages(check_min_max, familyNameString, notification.user.ranking,
                                           notification.ranked, false, "", r_u_strings.for_r_u_games);
        }

        // check bot is available, else don't mislead user:
        if (!ObjectIsEmpty(config.check_rejectnew())) {
            const connLog = "Not accepting new games (rejectnew).";
            const reject = config.rejectnewmsg;
            return { connLog, reject };
        }
        if (this.connected_games) {
            const number_connected_games = Object.keys(this.connected_games).length;
            const check_max = config.check_max_root(number_connected_games, "maxconnectedgames");
            if (!ObjectIsEmpty(check_max)) {
                const connLog = `${number_connected_games} games being played, maximum is ${check_max.maxAllowed}`;
                const reject = `Currently, ${number_connected_games} games are being played by this `
                               + `bot, maximum is ${check_max.maxAllowed} (if you see this message `
                               + `and you dont see any game on the bot profile page, it is because `
                               + `private game(s) are being played), try again later`;
                return { connLog, reject };
            }
        } else if (config.DEBUG) {
            console.log("There are no connected games");
        }
        const connected_games_per_user = this.gamesForPlayer(notification.user.id);
        const check_max_per_user = config.check_max_root(connected_games_per_user, "maxconnectedgamesperuser");
        if (!ObjectIsEmpty(check_max_per_user)) {
            const connLog = `Too many connected games for this user, maximum is ${check_max_per_user.maxAllowed}`;
            const reject = `Maximum number of simultaneous games allowed per player against `
                           + `this bot ${check_max_per_user.maxAllowed}, please reduce your `
                           + `number of simultaneous games against this bot, and try again`;
            return { connLog, reject };
        }
    }
    // Check challenge sanity checks
    //
    //checkChallengeSanityChecks(notification, r_u_strings) {

        // TODO: add all sanity checks here of all unhandled notifications
        //
        //

    //}
    // Check challenge booleans ("nopause" is in game.js, not here)
    //
    checkChallengeBooleans(notification, r_u_strings) {

        const testBooleanArgs = [ // "publiconly", "Private games are", notification.private],
                                  // "privateonly", "Non-private games are", !notification.private],
                                  ["rankedonly", "Unranked games are", !notification.ranked],
                                  ["unrankedonly", "Ranked games are", notification.ranked]
                                ];
        
        for (const [familyNameString, nameF, notifCondition] of testBooleanArgs) {
            if (!ObjectIsEmpty(config.check_booleans_aspecific(notifCondition, familyNameString))) {
                const connLog = `${nameF} not allowed`;
                const reject = `${nameF} not allowed on this bot.`;
                return { connLog, reject };
            }
        }

        const testBooleanArgs_r_u = [ ["proonly", "Games against non-professionals are",
                                       !notification.user.professional],
                                      ["nopauseonweekends", "Pause on week-ends is",
                                       notification.pause_on_weekends],
                                      ["noautokomi", "-Automatic- komi is",
                                       (String(notification.komi) === "null")],
                                      ["noautohandicap", "-Automatic- handicap is",
                                       notification.handicap === -1],
                                    ];

        for (const [familyNameString, nameF, notifCondition] of testBooleanArgs_r_u) {
            if (!ObjectIsEmpty(config.check_boolean_args_RU(notifCondition, notification.ranked, familyNameString))) {
                const connLog = `${nameF} not allowed ${r_u_strings.for_r_u_games}`;
                const reject = `${nameF} not allowed on this bot ${r_u_strings.for_r_u_games}.`;
                return { connLog, reject };
            }
        }
    }
    // Check challenge comma-separated families
    //
    checkChallengeCommaSeparatedPartTwo(notification, r_u_strings) {

        config.check_boardsizes_comma_separated_RU(notifW, notifH, rankedStatus);


        const testsCommaSeparated = [ ["komis", "Komi", String(notification.komi)],
                                      ["rules", "Rule", notification.rules],
                                      ["challengercolors", "Player Color", notification.challenger_color],
                                      ["speeds", "Speed", notification.time_control.speed],
                                      ["timecontrols", "Time control", notification.time_control.time_control]
                                    ];
        for (const [familyNameString, name, notif, notifTwo] of testsCommaSeparated) {
            



            const check_comma_families = config.check_comma_separated_RU(notif, notification.ranked, familyNameString);





            if (!ObjectIsEmpty(check_comma_families)) {
                let notifDisplayed = String(notif);
                let allowedArgsDisplayed = check_comma_families.argsString;
                /*if (familyNameString === "boardsizes") {
                    notifDisplayed = `${notification.width}x${notification.height}`;
                    allowedArgsDisplayed = boardsizeSquareToDisplayString(allowedArgsDisplayed);
                } else if (familyNameString === "komis") {
                    allowedArgsDisplayed = komisToDisplayString(allowedArgsDisplayed);
                    //`any komi between ${check_comma_families.minAllowed} and ${check_comma_families.maxAllowed}`;
                }*/
                const connLog = `${name} -${notifDisplayed}- ${r_u_strings.for_r_u_games}, `
                                + `not in:\n${allowedArgsDisplayed} `;
                const reject = `${name} -${notifDisplayed}- is not allowed on this bot `
                               + `${r_u_strings.for_r_u_games}, please choose among:`
                               + `\n-${allowedArgsDisplayed}-`;
                return { connLog, reject };
            }
        }
    }
    // Check challenge minMax families
    //
    checkChallengeMinMaxPartTwo(notification, r_u_strings) {

        // TODO: modify or remove fakebotrank code whenever server sends us automatic handicap 
        //       notification.handicap different from -1.
        /* adding a .floor: 5.9k (6k) vs 6.1k (7k) is 0.2 rank difference,
        /  but it is still a 6k vs 7k = 1 rank difference = 1 automatic handicap stone*/
        const handicapNotif = ((notification.handicap === -1 && config.fakebotrank) ?
                              Math.abs(Math.floor(notification.user.ranking) - Math.floor(config.fakebotrank)) :
                              notification.handicap);

        const check_min_max = config.check_min_max_args_RU(notif, notificationRanked, "handicap", "handicap stones");
        if (!ObjectIsEmpty(check_min_max)) {
            return getMinMaxRejectMessages(check_min_max, familyNameString, handicapNotif,
                                           notification.ranked, config.fakebotrank, "",
                                           r_u_strings.for_r_u_games);
        }
        
        const blitzLiveCorr = notif.time_control.speed; 
        const check_min_max_MPP = config.check_min_max_maintime_periods_periodtime_args_BLC_RU(notif, notifRanked, blitzLiveCorr);
        if (!ObjectIsEmpty(check_min_max_MPP)) {
            return getMinMaxRejectMessages(check_min_max_MPP, notification.time_control,
                                           notification.ranked, false, `in ${blitzLiveCorr} `,
                                           r_u_strings.for_r_u_games);
        }
    }
    on_challenge(notification) {
        // load strings
        const r_u_strings = ranked_unranked_strings_connection(notification.ranked);
        const acceptingRejectingSentence = createAcceptingRejectingSentence(messages, 
                                           notification.handicap, notification.user.username,
                                           notification.user.ranking, notification.width, 
                                           notification.height, notification.game_id);

        // check challenge entirely
        for (const test of [this.checkChallengeMandatory,
                            //this.checkChallengeSanityChecks,
                            this.checkChallengeBooleans,
                            this.checkChallengeCommaSeparatedPartTwo,
                            this.checkChallengeMinMaxPartTwo]) {
            const messages = test.bind(this)(notification, r_u_strings);

            if (!ObjectIsEmpty(messages)) {
                conn_log(messages.connLog);
                conn_log(acceptingRejectingSentence);

                post(api1('me/challenges/' + notification.challenge_id), this.auth({
                    'delete': true,
                    'message': messages.reject || "The AI you've challenged has rejected this game.",
                }))
                .then(ignore)
                .catch(conn_log)
            }
        }
        /* All good: accepting challenge */
        conn_log(acceptingRejectingSentence);
    }
    processMove(gamedata) {
        const game = this.connectToGame(gamedata.id);
        game.makeMove(gamedata.move_number);
    }
    processStoneRemoval(gamedata) {
        return this.processMove(gamedata);
    }
    on_delete() {
        /* don't care about delete notifications */
    }
    on_gameStarted() {
        /* don't care about gameStarted notifications */
    }
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
            if (idx === -1)  continue;

            this.games_by_player[player].splice(idx, 1);  // Remove element
            if (this.games_by_player[player].length === 0) {
                delete this.games_by_player[player];
            }
            return;
        }
    }
    gamesForPlayer(player) {
        if (!this.games_by_player[player])  return 0;
        return this.games_by_player[player].length;
    }
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
        const now = Date.now();
        const latency = now - data.client;
        this.network_latency = latency;
        this.clock_drift = ((now-latency/2) - data.server);
    }}}
    terminate() {{{
        clearTimeout(this.connect_timeout);
        clearInterval(this.ping_interval);
        clearInterval(this.notification_connect_interval);
        clearInterval(this.corr_queue_interval);
    }}}
}

function request(method, host, port, path, data) {
    return new Promise((resolve, reject) => {
        if (config.DEBUG) {
            /* Keeping a backup of old deep copy syntax just in case.
            /  const noapidata = JSON.parse(JSON.stringify(data));
            /  noapidata.apikey = "hidden";*/

            // Modern NodeJS offers shallow copy syntax:
            const noapidata = { ...data, apikey: "hidden"};
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
}

function post(path, data, cb, eb) {
    return request("POST", config.host, config.port, path, data, cb, eb);
}

function api1(str) {
    return "/api/v1/" + str;
}

function ignore() {}

function conn_log() {
    let arr = ["# "];
    let errlog = false;
    for (let i=0; i < arguments.length; ++i) {
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

function objectIsEmpty(obj) {
    return Boolean(String(Object.keys(obj)));
}

function ranked_unranked_strings_connection(rankedStatus) {
    const r_u = (rankedStatus ? "unranked" : "ranked");
    return { for_r_u_games: `for ${r_u} games`,
             from_r_u_games: `from ${r_u} games` };
}

function rankToString(r) {
    const R = Math.floor(r);
    return (R >= 30 ? `${R - 30 + 1}d`
                    : `${30 - R}k`);
}

/* add for boardsizes display*/

function commaSeparatedNumbersToDisplayString(argsString) {
    let commaSeparated = "";
    for (const arg of argsString.split(',')) {
        if (arg.includes(':')) {
            const [min, max] = arg.split(':');
            commaSeparated = `${commaSeparated}from ${min} to ${max}`;
        } else {
            commaSeparated = `${commaSeparated}${arg}`;
        }
        const splitter = (arg === commaSeparated.slice(-1) ? "." : ", ");
        commaSeparated = `${commaSeparated}${splitter}`;
    }
    return commaSeparated;
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

function argMIBL(isMin) {
    if (isMin) {
        return { miniMaxi: "Minimum", incDec: "increase", belAbo: "below", lowHig: "low" };
    } else {
        return { miniMaxi: "Maximum", incDec: "reduce", belAbo: "above", lowHig: "high" };
    }
}

function createMinMaxConnLogSentence(name, MIBL, notif, arg, fakeBotRank, blc_sentence, for_r_u_games) {
    const fakeBotRankMsg = (fakebotRank ? `(fakeBotRank: ${fakeBotRank})`
                                        : "");
    return (`${MIBL.miniMaxi} ${name} ${blc_sentence}${for_r_u_games} ${notif} `
            + `is ${MIBL.belAbo} ${arg} ${fakeBotRankMsg}.`);
}

function createMinMaxRejectSentence(familyNameString, name, MIBL, notif, arg, isMin, blc_sentence, for_r_u_games) {
    if (familyNameString === "handicap") {
        if (!isMin && arg === 0 && notif > 0) return "Even games only (no handicap on this bot).";
        if (isMin && arg > 0 && notif === 0) return "Handicap games only (no even games on this bot).";
    }
    const endingSentence = `please ${MIBL.incDec} ${name}`;
    return (`${MIBL.miniMaxi} ${name} ${blc_sentence}${for_r_u_games} is ${arg}, ${endingSentence}.`);
}

function minMaxNumberToDisplayString(familyNameString, number) {
    if (familyNameString === "rank") {
        return rankToString(number);
    }
    if (["maintime", "periodtime"].includes(familyNameString)) {
        return timespanToDisplayString(number)
    }
    return number;
}

function getMinMaxRejectMessages(check_min_max, familyNameString, notif, fakeBotRank, blc_sentence, for_r_u_games) {
    const MIBL = argMIBL(check_min_max.isMin);
    const allowed = minMaxNumberToDisplayString(familyNameString, check_min_max.minMaxArg);
    const notifDisplayed = minMaxNumberToDisplayString(familyNameString, notif);
    const connLogMsg = createMinMaxConnLogSentence(name, MIBL, notifDisplayed, allowed, fakeBotRank, blc_sentence, for_r_u_games);                      
    const rejectMsg = createMinMaxRejectSentence(familyNameString, name, MIBL, notifDisplayed,
                                                 allowed, check_min_max.isMin, blc_sentence, for_r_u_games);
    return { connLogMsg, rejectMsg };
}

function createAcceptingRejectingSentence(messages, handicap, username, ranking, width, height, game_id) {
    const accepting = (messages ? "Rejecting" : "Accepting");
    const handi = (handicap > 0 ? `H${handicap}` : "");

    return sprintf("%s challenge from %s (%s)  [%ix%i] %s id = %i",
                   accepting, username, rankToString(ranking),
                   width, height, handi, game_id);
}

exports.Connection = Connection;
