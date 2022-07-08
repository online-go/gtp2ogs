import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as querystring from "querystring";

import { trace } from "./trace";
import { getArgNamesGRU, getArgNamesUnderscoredGRU, getRankedUnranked } from "./options";

let config;
import { Game } from "./Game";

/****************/
/** Connection **/
/****************/

const ignorable_notifications = {
    delete: true,
    gameStarted: true,
    gameEnded: true,
    gameDeclined: true,
    gameResumedFromStoneRemoval: true,
    tournamentStarted: true,
    tournamentEnded: true,
};

export class Connection {
    notification_connect_interval: ReturnType<typeof setInterval>;
    connected_games: { [game_id: string]: Game };

    socket: any;
    games_by_player: any;
    connected: any;
    connect_timeout: any;
    idle_timeout_interval: any;
    clock_drift: any;
    network_latency: any;
    ping_interval: any;
    jwt: any;
    bot_id: any;
    corr_queue_interval: any;
    corr_moves_processing: any;

    constructor(io_client, myConfig) {
        config = myConfig;
        const prefix = (config.insecure ? `http://` : `https://`) + `${config.host}:${config.port}`;

        conn_log(`Connecting to ${prefix}`);
        const socket = (this.socket = io_client(prefix, {
            reconection: true,
            reconnectionDelay: 500,
            reconnectionDelayMax: 60000,
            transports: ["websocket"],
        }));

        this.connected_games = {};
        this.games_by_player = {}; // Keep track of connected games per player
        this.connected = false;

        this.connect_timeout = setTimeout(
            () => {
                if (!this.connected) {
                    trace.error(`Failed to connect to ${prefix}`);
                    process.exit(-1);
                }
            },
            /online-go.com$/.test(config.host) ? 5000 : 500,
        );

        if (config.timeout) {
            this.idle_timeout_interval = setInterval(this.disconnectIdleGames.bind(this), 10000);
        }
        if (config.DEBUG) {
            setInterval(this.dumpStatus.bind(this), 15 * 60 * 1000);
        }

        this.clock_drift = 0;
        this.network_latency = 0;
        this.ping_interval = setInterval(this.ping.bind(this), 10000);
        socket.on("net/pong", this.handlePong.bind(this));

        socket.on("connect", () => {
            this.connected = true;
            conn_log("Connected");
            this.ping();

            socket.emit("bot/id", { id: config.username }, (obj) => {
                this.bot_id = obj.id;
                this.jwt = obj.jwt;
                if (!this.bot_id) {
                    trace.error(`ERROR: Bot account is unknown to the system: ${config.username}`);
                    process.exit();
                }
                conn_log("Bot is username: ", config.username);
                conn_log("Bot is user id: ", this.bot_id);
                socket.emit("authenticate", this.auth({}));
                socket.emit("notification/connect", this.auth({}), (x) => {
                    conn_log(x);
                });
                socket.emit("bot/connect", this.auth({}));
                socket.emit("bot/hidden", !!config.hidden);
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
                        const game = candidates[Math.floor(Math.random() * candidates.length)];
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
                socket.emit("notification/connect", this.auth({}), (x) => {
                    conn_log(x);
                });
            }
        }, 10000);
        socket.on("event", (data) => {
            //this.verbose(data);
            trace.debug(data);
        });
        socket.on("disconnect", () => {
            this.connected = false;

            conn_log("Disconnected from server");

            for (const game_id in this.connected_games) {
                this.disconnectFromGame(game_id);
            }
        });

        socket.on("notification", (notification) => {
            if (this[`on_${notification.type}`]) {
                this[`on_${notification.type}`](notification);
            } else {
                if (!(notification.type in ignorable_notifications)) {
                    trace.log("Unhandled notification type: ", notification.type, notification);
                }
                if (notification.type !== "delete") {
                    this.deleteNotification(notification);
                }
            }
        });

        socket.on("active_game", (gamedata) => {
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
                            trace.log(
                                `Starting disconnect Timeout in Connection active_game for ${gamedata.id}`,
                            );
                        }
                        this.connected_games[gamedata.id].disconnect_timeout = setTimeout(() => {
                            this.disconnectFromGame(gamedata.id);
                        }, 1000);
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
            if (config.DEBUG) {
                conn_log("Connected to game", game_id, "already");
            }
            return this.connected_games[game_id];
        }

        return (this.connected_games[game_id] = new Game(this, game_id, config));
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
            if (state.clock.current_player !== this.bot_id && idle_time > config.timeout) {
                if (config.DEBUG) {
                    conn_log(
                        "Found idle game",
                        game_id,
                        ", other player has been idling for",
                        idle_time,
                        ">",
                        config.timeout,
                    );
                }
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
                msg.push("no_state");
                conn_log(...msg);
                continue;
            }
            msg.push(`black = ${game.state.players.black.username}`);
            msg.push(`white = ${game.state.players.white.username}`);
            if (game.state.clock.current_player === this.bot_id) {
                msg.push("bot_turn");
            }
            const idle_time = (Date.now() - game.state.clock.last_move) / 1000;
            msg.push(`idle_time = ${idle_time}s`);
            if (game.bot === null) {
                msg.push("no_bot");
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
        this.socket.emit(
            "notification/delete",
            this.auth({ notification_id: notification.id }),
            () => {
                conn_log("Deleted notification ", notification.id);
            },
        );
    }
    connection_reset() {
        for (const game_id in this.connected_games) {
            this.disconnectFromGame(game_id);
        }
        if (this.socket) {
            this.socket.emit("notification/connect", this.auth({}), (x) => {
                conn_log(x);
            });
        }
    }
    on_friendRequest(notification) {
        trace.log("Friend request from ", notification.user.username);
        post(api1("me/friends/invitations"), this.auth({ from_user: notification.user.id }))
            .then((obj) => conn_log(obj.body))
            .catch(conn_log);
    }

    // Make sure challenge is checkable, else don't check it.
    //
    checkChallengeSanityChecks(notification) {
        // TODO: add all sanity checks here of all unhandled notifications

        // notification sample as of 24 june 2020
        // recent change in rating system in https://forums.online-go.com/t/2020-rating-and-rank-tweaks-and-analysis/28649
        // notification.user.ratings.overall.games_played key was removed
        // possibly other changes might be made in the future, keeping a sample as a reference
        // {"id":"787:118a6213-4371-4fbf-9574-11c8016e86d8","type":"challenge","player_id":787,
        // "timestamp":1593029394,"read_timestamp":0,"read":0,"aux_delivered":0,
        // "game_id":8374,"challenge_id":4878,
        // "user":{"id":786,"country":"un","username":"testuser",
        // "icon_url":"https://b0c2ddc39d13e1c0ddad-93a52a5bc9e7cc06050c1a999beb3694.ssl.cf1.rackcdn.com/6c89b5fd5c1965608d50d4f9b4829078-32.png",
        // "ratings":{"overall":{"rating":1190.1419101664915,"deviation":147.528546071068,"volatility":0.06006990721444128}},
        // "ui_class":"","professional":false,"rating":"1190.142","ranking":10.51848380474934},
        // "rules":"chinese","ranked":false,"aga_rated":false,"disable_analysis":false,
        // "handicap":0,"komi":null,
        // "time_control":{"system":"fischer","time_control":"fischer","speed":"live",
        // "pause_on_weekends":false,
        // "time_increment":30,"initial_time":120,"max_time":300},
        // "challenger_color":"automatic","width":19,"height":19}

        // do not check everything, only the keys we need.
        const notificationKeys = [
            "user",
            "rules",
            "ranked",
            "handicap",
            "komi",
            "time_control",
            "width",
            "height",
        ];
        const resultNotificationKeys = getCheckedKeysInObjRejectResult(
            notificationKeys,
            notification,
        );
        if (resultNotificationKeys) {
            return resultNotificationKeys;
        }

        const notificationKeysUser = ["id", "username", "professional", "ranking", "ui_class"];
        const resultNotificationKeysUser = getCheckedKeysInObjRejectResult(
            notificationKeysUser,
            notification.user,
        );
        if (resultNotificationKeysUser) {
            return resultNotificationKeysUser;
        }

        const notificationKeysTimecontrol = ["time_control", "speed", "pause_on_weekends"];
        const resultNotificationKeysTimecontrol = getCheckedKeysInObjRejectResult(
            notificationKeysTimecontrol,
            notification.time_control,
        );
        if (resultNotificationKeysTimecontrol) {
            return resultNotificationKeysTimecontrol;
        }

        processCheckedTimeSettingsKeysRejectResult(
            "byoyomi",
            ["main_time", "periods", "period_time"],
            notification.time_control,
        );
        processCheckedTimeSettingsKeysRejectResult(
            "canadian",
            ["main_time", "stones_per_period", "period_time"],
            notification.time_control,
        );
        processCheckedTimeSettingsKeysRejectResult(
            "fischer",
            ["initial_time", "max_time", "time_increment"],
            notification.time_control,
        );
        processCheckedTimeSettingsKeysRejectResult(
            "simple",
            ["per_move"],
            notification.time_control,
        );
        processCheckedTimeSettingsKeysRejectResult(
            "absolute",
            ["total_time"],
            notification.time_control,
        );
        // time control "none" has no time settings key, no need to check it.

        // unknown speed "turbo" makes --minmaintimeturbo uncheckable.
        const knownSpeeds = ["blitz", "live", "correspondence"];
        if (!knownSpeeds.includes(notification.time_control.speed)) {
            err(`Unknown speed ${notification.time_control.speed}.`);
            const msg = `Unknown speed ${notification.time_control.speed}, cannot check challenge, please try again.`;
            return { reject: true, msg };
        }

        // unknown time control "penalty" is undefined in timesObj["penalty"].maintime, uncheckable.
        const knownTimecontrols = ["fischer", "byoyomi", "canadian", "simple", "absolute", "none"];
        if (!knownTimecontrols.includes(notification.time_control.time_control)) {
            err(`Unknown time control ${notification.time_control.time_control}.`);
            const msg = `Unknown time control ${notification.time_control.time_control}, cannot check challenge, please try again.`;
            return { reject: true, msg };
        }

        // Sometimes server sends us live challenges with pauses on weekends enabled.
        if (
            notification.time_control.pause_on_weekends &&
            notification.time_control.speed !== "correspondence"
        ) {
            err(
                `Unhandled pause on weekends in non-correspondence challenge (${notification.time_control.speed}).`,
            );
            const msg = `There was an unexpected error: your ${notification.time_control.speed} challenge has pause on weekends, but this is only possible for correspondence games, please try again.`;
            return { reject: true, msg };
        }

        return { reject: false }; // OK !
    }
    // Check challenge user is acceptable, else don't mislead user
    //
    checkChallengeUser(notification) {
        for (const uid of ["username", "id"]) {
            console.log(config.banned_users);
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

        const resultNoProvisional = getNoProvisionalRejectResult(
            notification.user.ui_class,
            notification.ranked,
        );
        if (resultNoProvisional) {
            return resultNoProvisional;
        }

        if (!notification.user.professional) {
            const beginning = "Games against non-professionals are";
            const ending = "";
            const resultProonly = getBooleansGRURejectResult(
                "proonly",
                notification.ranked,
                beginning,
                ending,
            );
            if (resultProonly) {
                return resultProonly;
            }
        }

        const resultRank = getMinMaxRankRejectResult(
            notification.user.ranking,
            notification.ranked,
        );
        if (resultRank) {
            return resultRank;
        }

        return { reject: false }; // OK !
    }
    // Check bot is available, else don't mislead user
    //
    checkChallengeBot(notification, fs) {
        if (check_rejectnew(fs)) {
            conn_log("Not accepting new games (rejectnew).");
            return { reject: true, msg: config.rejectnewmsg };
        }

        if (this.connected_games) {
            const number_connected_games = Object.keys(this.connected_games).length;
            if (config.DEBUG) {
                trace.log(`# of connected games = ${number_connected_games}`);
            }
            if (number_connected_games >= config.maxconnectedgames) {
                conn_log(
                    `${number_connected_games} games being played, maximum is ${config.maxconnectedgames}`,
                );
                const msg = `Currently, ${number_connected_games} games are being played by this bot, maximum is ${config.maxconnectedgames} (if you see this message and you dont see any game on the bot profile page, it is because private game(s) are being played), try again later`;
                return { reject: true, msg };
            }
        } else if (config.DEBUG) {
            trace.log("There are no connected games");
        }

        const connected_games_per_user = this.countGamesForPlayer(notification.user.id);
        if (connected_games_per_user >= config.maxconnectedgamesperuser) {
            conn_log("Too many connected games for this user.");
            const msg = `Maximum number of simultaneous games allowed per player against this bot ${config.maxconnectedgamesperuser}, please reduce your number of simultaneous games against this bot, and try again`;
            return { reject: true, msg };
        }

        return { reject: false }; // OK !
    }
    // Check some booleans allow a game ("nopause" is in game.js, not here)
    //
    checkChallengeBooleans(notification) {
        if (config.rankedonly && !notification.ranked) {
            return getBooleansGeneralReject("Unranked games are");
        }
        if (config.unrankedonly && notification.ranked) {
            return getBooleansGeneralReject("Ranked games are");
        }

        if (notification.pause_on_weekends) {
            const beginning = "Pause on week-ends is";
            const ending = "";
            const resultNoPauseWeekends = getBooleansGRURejectResult(
                "nopauseonweekends",
                notification.ranked,
                beginning,
                ending,
            );
            if (resultNoPauseWeekends) {
                return resultNoPauseWeekends;
            }
        }

        return { reject: false }; // OK !
    }
    // Check challenge allowed group options are allowed
    //
    checkChallengeAllowedGroup(notification) {
        // only square boardsizes, except if all is allowed
        if (notification.width !== notification.height) {
            if (
                config.boardsizes &&
                !config.boardsizesranked &&
                !config.boardsizesunranked &&
                !config.allow_all_boardsizes
            ) {
                return getBoardsizeNotSquareReject(
                    "boardsizes",
                    notification.width,
                    notification.height,
                );
            }
            if (
                config.boardsizesranked &&
                notification.ranked &&
                !config.allow_all_boardsizes_ranked
            ) {
                return getBoardsizeNotSquareReject(
                    "boardsizesranked",
                    notification.width,
                    notification.height,
                );
            }
            if (
                config.boardsizesunranked &&
                !notification.ranked &&
                !config.allow_all_boardsizes_unranked
            ) {
                return getBoardsizeNotSquareReject(
                    "boardsizesunranked",
                    notification.width,
                    notification.height,
                );
            }
        }

        // if square, check if square board size is allowed
        const resultBoardsizes = getAllowedGroupRejectResult(
            "boardsizes",
            "Board size",
            notification.width,
            notification.ranked,
        );
        if (resultBoardsizes) {
            return resultBoardsizes;
        }

        const resultKomis = getAllowedGroupRejectResult(
            "komis",
            "Komi",
            notification.komi,
            notification.ranked,
        );
        if (resultKomis) {
            return resultKomis;
        }

        const resultSpeeds = getAllowedGroupRejectResult(
            "speeds",
            "Speed",
            notification.time_control.speed,
            notification.ranked,
        );
        if (resultSpeeds) {
            return resultSpeeds;
        }

        const resultTimecontrols = getAllowedGroupRejectResult(
            "timecontrols",
            "Time control",
            notification.time_control.time_control,
            notification.ranked,
        );
        if (resultTimecontrols) {
            return resultTimecontrols;
        }

        return { reject: false }; // OK !
    }

    // Check challenge handicap is allowed
    //
    checkChallengeHandicap(notification) {
        if (notification.handicap === -1) {
            const beginning = "-Automatic- handicap is";
            const ending =
                ", please manually select the number of handicap stones in -custom- handicap";
            const resultNoAutoHandicap = getBooleansGRURejectResult(
                "noautohandicap",
                notification.ranked,
                beginning,
                ending,
            );
            if (resultNoAutoHandicap) {
                return resultNoAutoHandicap;
            }
        }

        const resultHandicap = getMinMaxHandicapRejectResult(
            notification.handicap,
            notification.ranked,
        );
        if (resultHandicap) {
            return resultHandicap;
        }

        return { reject: false }; // Ok !
    }
    // Check challenge time settings are allowed
    //
    checkChallengeTimeSettings(notification) {
        // time control "none" has no maintime, no periods number, no periodtime, no need to check reject.
        if (notification.time_control.time_control !== "none") {
            const resultMaintime = getMinMaxMainPeriodTimeRejectResult(
                "maintime",
                notification.time_control,
                notification.ranked,
            );
            if (resultMaintime) {
                return resultMaintime;
            }

            // "fischer", "canadian", "simple", "absolute", don't have a periods number,
            // arg compared to undefined notificationT.periods will always return false, thus
            // always rejecting: don't check it.
            //
            if (notification.time_control.time_control === "byoyomi") {
                const resultPeriods = getMinMaxPeriodsRejectResult(
                    "periods",
                    notification.time_control,
                    notification.ranked,
                );
                if (resultPeriods) {
                    return resultPeriods;
                }
            }

            const resultPeriodtime = getMinMaxMainPeriodTimeRejectResult(
                "periodtime",
                notification.time_control,
                notification.ranked,
            );
            if (resultPeriodtime) {
                return resultPeriodtime;
            }
        }

        return { reject: false }; // Ok !
    }

    // Check challenge entirely, and return reject status + optional error msg.
    //
    checkChallenge(notification) {
        const tests = [
            [this.checkChallengeSanityChecks, notification],
            [this.checkChallengeUser, notification],
            [this.checkChallengeBot, notification, fs],
            [this.checkChallengeBooleans, notification],
            [this.checkChallengeAllowedGroup, notification],
            [this.checkChallengeHandicap, notification],
            [this.checkChallengeTimeSettings, notification],
        ];

        for (const [test, ...params] of tests) {
            const result = test.bind(this)(...params);
            if (result.reject) {
                return result;
            }
        }

        return { reject: false }; /* All good. */
    }
    on_challenge(notification) {
        const c0 = this.checkChallenge(notification);
        const rejectmsg = c0.msg ? c0.msg : "";

        const handi = notification.handicap > 0 ? `H${notification.handicap}` : "";
        const accepting = c0.reject ? "Rejecting" : "Accepting";
        conn_log(
            `${accepting} challenge from ${notification.user.username} (${rankToString(
                notification.user.ranking,
            )})  [${notification.width}x${notification.height}] ${handi} id = ${
                notification.game_id
            }`,
        );

        if (!c0.reject) {
            post(api1(`me/challenges/${notification.challenge_id}/accept`), this.auth({}))
                .then(ignore)
                .catch(() => {
                    conn_log("Error accepting challenge, declining it");
                    post(
                        api1(`me/challenges/${notification.challenge_id}`),
                        this.auth({
                            delete: true,
                            message: "Error accepting game challenge, challenge has been removed.",
                        }),
                    )
                        .then(ignore)
                        .catch(conn_log);
                    this.deleteNotification(notification);
                });
        } else {
            post(
                api1(`me/challenges/${notification.challenge_id}`),
                this.auth({
                    delete: true,
                    message: rejectmsg || "The AI you've challenged has rejected this game.",
                }),
            )
                .then(ignore)
                .catch(conn_log);
        }
    }
    // processMove(gamedata) {
    //     const game = this.connectToGame(gamedata.id)
    //     game.makeMove(gamedata.move_number);
    // }
    addGameForPlayer(game_id, player) {
        if (!this.games_by_player[player]) {
            this.games_by_player[player] = [game_id];
            return;
        }
        if (this.games_by_player[player].indexOf(game_id) !== -1) {
            // Already have it ?
            return;
        }
        this.games_by_player[player].push(game_id);
    }
    removeGameForPlayer(game_id) {
        for (const player in this.games_by_player) {
            const idx = this.games_by_player[player].indexOf(game_id);
            if (idx === -1) {
                continue;
            }

            this.games_by_player[player].splice(idx, 1); // Remove element
            if (this.games_by_player[player].length === 0) {
                delete this.games_by_player[player];
            }
            return;
        }
    }
    countGamesForPlayer(player) {
        if (!this.games_by_player[player]) {
            return 0;
        }
        return this.games_by_player[player].length;
    }
    ping() {
        this.socket.emit("net/ping", { client: new Date().getTime() });
    }
    handlePong(data) {
        const now = Date.now();
        const latency = now - data.client;
        this.network_latency = latency;
        this.clock_drift = now - latency / 2 - data.server;
    }
    terminate() {
        clearTimeout(this.connect_timeout);
        clearInterval(this.ping_interval);
        clearInterval(this.notification_connect_interval);
        clearInterval(this.corr_queue_interval);
    }
    hide() {
        this.socket.emit("bot/hidden", true);
    }
    unhide() {
        this.socket.emit("bot/hidden", false);
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
            if (typeof data[k] === "object") {
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
                "Content-Type": enc_data_type,
                "Content-Length": enc_data.length,
            },
        };
        if (headers) {
            for (const k in headers) {
                options.headers[k] = headers[k];
            }
        }

        const req = (config.insecure ? http : https).request(options, (res) => {
            //test
            res.setEncoding("utf8");
            let body = "";
            res.on("data", (chunk) => {
                body += chunk;
            });
            res.on("end", () => {
                if (res.statusCode < 200 || res.statusCode > 299) {
                    reject({ error: `${res.statusCode} - ${body}`, response: res, body: body });
                    return;
                }
                resolve({ response: res, body: body });
            });
        });
        req.on("error", (e) => {
            reject({ error: e.message });
        });

        req.write(enc_data);
        req.end();
    });
}

function post(path, data): Promise<any> {
    return request("POST", config.host, config.port, path, data);
}

function api1(str) {
    return `/api/v1/${str}`;
}

function ignore() {}

function conn_log(...args) {
    const arr = ["# "];
    let errlog = false;
    for (let i = 0; i < args.length; ++i) {
        const param = args[i];
        if (typeof param === "object" && "error" in param) {
            errlog = true;
            arr.push(param.error);
        } else {
            arr.push(param);
        }
    }

    if (errlog) {
        trace.error.apply(null, arr);
        trace.error(new Error().stack);
    } else {
        trace.log.apply(null, arr);
    }
}

function err(str) {
    conn_log("ERROR: ", str);
}

function getRankedUnrankedGames(argName) {
    const rankedUnranked = getRankedUnranked(argName);
    return `${rankedUnranked} games`.trim();
}

function getForFromBLCRankedUnrankedGames(forFrom, BLC, argName, all) {
    const rankedUnrankedGames = getRankedUnrankedGames(argName);

    if (BLC !== "") {
        return ` ${forFrom}${BLC}${rankedUnrankedGames}`; // ex: "for blitz ranked games"
        // ex: "for correspondence games"
    }
    if (all === "all") {
        return `${forFrom}${all} games`; // ex: "from all games"
    } else {
        if (argName.includes("ranked")) {
            return ` ${forFrom}${rankedUnrankedGames}`; // ex: "for ranked games"
        } else {
            return ""; // no need to say explicitly "for all games"
        } // "for ranked games and for unranked games": general argument)
    }
}

function getSuggestionSentence(argName) {
    if (argName.includes("ranked")) {
        return `.\nYou may try ${argName.includes("unranked") ? "ranked" : "unranked"}`;
    } else {
        return "";
    }
}

function rankToString(r) {
    const R = Math.floor(r);
    if (R >= 30) {
        return `${R - 30 + 1}d`;
    } // R >= 30: 1 dan or stronger
    else {
        return `${30 - R}k`;
    } // R < 30:  1 kyu or weaker
}

function getRejectBanned(username, ranked) {
    return getReject(
        `You (${username}) are not allowed to play ${ranked}${
            ranked ? " " : ""
        }games against this bot.`,
    );
}

function getReject(reason) {
    conn_log(reason);
    return { reject: true, msg: reason };
}

function getCheckedKeyInObjReject(k) {
    err(`Missing key ${k}.`);
    const msg = `Missing key ${k}, cannot check challenge, please try again.`;
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
        if (resultNotificationKeysTimeSettings) {
            return resultNotificationKeysTimeSettings;
        }
    }
}

function check_rejectnew(fs) {
    if (config.rejectnew) {
        return true;
    }
    if (config.rejectnewfile && fs.existsSync(config.rejectnewfile)) {
        return true;
    }
    return false;
}

function getCheckedArgName(optionName, notificationRanked) {
    const argNames = getArgNamesGRU(optionName);
    const [general, ranked, unranked] = argNames;

    // for numbers, check for undefined: 0 or null are checked false but are a valid arg to test against notif
    //
    if (config[unranked] !== undefined && !notificationRanked) {
        return unranked;
    }
    if (config[ranked] !== undefined && notificationRanked) {
        return ranked;
    }
    if (config[general] !== undefined) {
        return general;
    }
    // no valid arg to test, this happens when bot admin inputs no value and we
    // provide no default either (ex: minmaxrank, minmaxhandicap, etc.)
    return undefined;
}

function checkOptionIsInUiClass(notifUiClass, option) {
    return notifUiClass.split(" ").includes(option);
}

function getNoProvisionalRejectResult(notif, notificationRanked) {
    const argName = getCheckedArgName(`noprovisional`, notificationRanked);
    if (argName && checkOptionIsInUiClass(notif, "provisional")) {
        const forRankedUnrankedGames = getForFromBLCRankedUnrankedGames("for ", "", argName, "");
        const msg = `It seems you are still new on OGS (Provisional Player), this bot only accepts challenges from players with a regular ranking${forRankedUnrankedGames}, you need to play a few more ranked games.`;
        conn_log(`${argName}.`);
        return { reject: true, msg };
    }
}

function getBooleansGeneralReject(nameF) {
    const msg = `${nameF} not allowed on this bot.`;
    conn_log(msg);
    return { reject: true, msg };
}

function getBooleansGRUReject(argName, nameF, ending) {
    const rankedUnranked = getForFromBLCRankedUnrankedGames("for ", "", argName, "");
    const msg = `${nameF} not allowed on this bot${rankedUnranked}${ending}.`;
    conn_log(msg);
    return { reject: true, msg };
}

function getBoardsizeNotSquareReject(argName, notificationWidth, notificationHeight) {
    const rankedUnranked = getForFromBLCRankedUnrankedGames("for ", "", argName, "");
    conn_log(
        `boardsize ${notificationWidth}x${notificationHeight} is not square, not allowed ${rankedUnranked}`,
    );
    const msg = `Board size ${notificationWidth}x${notificationHeight} is not square, not allowed${rankedUnranked}.\nPlease choose a SQUARE board size (same width and height), for example try 9x9 or 19x19.`;
    return { reject: true, msg };
}

function boardsizeSquareToDisplayString(boardsizeSquare) {
    return boardsizeSquare
        .toString()
        .split(",")
        .map((e) => e.trim())
        .map((e) => `${e}x${e}`)
        .join(", ");
}

function getAllowedGroupNotifToString(argName, notif) {
    if (argName.includes("boardsizes")) {
        return boardsizeSquareToDisplayString(notif);
    }
    if (argName.includes("komis") && notif === null) {
        return "automatic";
    } else {
        return notif;
    }
}

function getAllowedGroupReject(argName, nameF, notif) {
    const forRankedUnrankedGames = getForFromBLCRankedUnrankedGames("for ", "", argName, "");

    const arg = config[argName];
    const argToString = argName.includes("boardsizes") ? boardsizeSquareToDisplayString(arg) : arg;
    const notifToString = getAllowedGroupNotifToString(argName, notif);

    conn_log(
        `${nameF} ${forRankedUnrankedGames}is ${notifToString}, not in ${argToString} (${argName}).`,
    );
    const msg = `${nameF} ${notifToString} is not allowed on this bot${forRankedUnrankedGames}, please choose one of these allowed ${nameF}s${forRankedUnrankedGames}:\n${argToString}.`;
    return { reject: true, msg };
}

function getAllowedGroupRejectResult(optionName, nameF, notif, notificationRanked) {
    const argNames = getArgNamesGRU(optionName);
    const [general, ranked, unranked] = argNames;
    const [general_underscored, ranked_underscored, unranked_underscored] =
        getArgNamesUnderscoredGRU(optionName);

    if (
        config[general] &&
        !config[ranked] &&
        !config[unranked] &&
        !config[`allow_all_${general_underscored}`] &&
        !config[`allowed_${general_underscored}`][notif]
    ) {
        return getAllowedGroupReject(general, nameF, notif);
    }
    if (
        config[ranked] &&
        notificationRanked &&
        !config[`allow_all_${ranked_underscored}`] &&
        !config[`allowed_${ranked_underscored}`][notif]
    ) {
        return getAllowedGroupReject(ranked, nameF, notif);
    }
    if (
        config[unranked] &&
        !notificationRanked &&
        !config[`allow_all_${unranked_underscored}`] &&
        !config[`allowed_${unranked_underscored}`][notif]
    ) {
        return getAllowedGroupReject(unranked, nameF, notif);
    }
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
        return { miniMaxi: "Maximum", incDec: "reduce", belAbo: "above" };
    }
}

function getFixedFirstNameS(nameS, timeControlSentence) {
    if (timeControlSentence.includes("canadian")) {
        return nameS;
    }
    if (nameS.includes("the")) {
        return nameS
            .split(" ")
            .filter((e) => e !== "the")
            .join(" ");
    } else {
        return nameS;
    }
}

function getMinMaxGenericMsg(MIBL, nameS, forRankedUnranked, timeControlSentence, argToString) {
    const fixedFirstNameS = getFixedFirstNameS(nameS, timeControlSentence);

    return `${MIBL.miniMaxi} ${fixedFirstNameS}${forRankedUnranked}${timeControlSentence} is ${argToString}`;
}

function getMinMaxReject(
    argToString,
    notifToString,
    isMin,
    speed,
    timeControlSentence,
    argName,
    nameS,
    middleSentence,
) {
    const MIBL = getMIBL(isMin);

    const forRankedUnranked = getForFromBLCRankedUnrankedGames("for ", speed, argName, "");
    const endingSentence = getSuggestionSentence(argName);

    conn_log(
        `${notifToString} is ${MIBL.belAbo} ${MIBL.miniMaxi} ${nameS}${forRankedUnranked}${timeControlSentence} ${argToString} (${argName}).`,
    );

    let msg = getMinMaxGenericMsg(MIBL, nameS, forRankedUnranked, timeControlSentence, argToString);
    const optionNameIsRank = argName.includes("minrank") || argName.includes("maxrank");
    if (optionNameIsRank) {
        msg += ".";
    } else {
        msg += `, please ${MIBL.incDec} ${nameS}${middleSentence}${endingSentence}.`;
    }

    return { reject: true, msg };
}

function getMinMaxRankRejectResult(notif, notificationRanked) {
    for (const minMax of ["min", "max"]) {
        const isMin = minMax === "min";
        const argName = getCheckedArgName(`${minMax}rank`, notificationRanked);
        if (argName) {
            const arg = config[argName];
            if (!checkNotifIsInMinMaxArgRange(arg, notif, isMin)) {
                return getMinMaxReject(
                    rankToString(arg),
                    rankToString(notif),
                    isMin,
                    "",
                    "",
                    argName,
                    "rank",
                    "",
                );
            }
        }
    }
}

function getBooleansGRURejectResult(argName, notificationRanked, beginning, ending) {
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
        const isMin = minMax === "min";
        const argName = getCheckedArgName(`${minMax}handicap`, notificationRanked);
        if (argName) {
            const arg = config[argName];
            if (!checkNotifIsInMinMaxArgRange(arg, notif, isMin)) {
                const middleSentence = getHandicapMiddleSentence(isMin, notif, arg);
                return getMinMaxReject(
                    arg,
                    notif,
                    isMin,
                    "",
                    "",
                    argName,
                    "the number of handicap stones",
                    middleSentence,
                );
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
    const notif = notificationT.periods;
    for (const minMax of ["min", "max"]) {
        const isMin = minMax === "min";
        const argName = getCheckedArgName(`${minMax}periods${blitzLiveCorr}`, notificationRanked);
        if (argName) {
            const arg = config[argName];
            if (!checkNotifIsInMinMaxArgRange(arg, notif, isMin)) {
                return getMinMaxReject(
                    arg,
                    notif,
                    isMin,
                    `${notificationT.speed} `,
                    ` in ${notificationT.time_control}`,
                    argName,
                    "the number of periods",
                    "",
                );
            }
        }
    }
}

function getTimecontrolObjsMainPeriodTime(mainPeriodTime, notificationT) {
    // for canadian, periodtime notif is for all the N stones.
    const timesObj = {
        fischer: {
            maintime: [
                { name: "Initial Time", notif: notificationT.initial_time },
                { name: "Max Time", notif: notificationT.max_time },
            ],
            periodtime: [{ name: "Increment Time", notif: notificationT.time_increment }],
        },
        byoyomi: {
            maintime: [{ name: "Main Time", notif: notificationT.main_time }],
            periodtime: [{ name: "Period Time", notif: notificationT.period_time }],
        },
        canadian: {
            maintime: [{ name: "Main Time", notif: notificationT.main_time }],
            periodtime: [
                {
                    name: `Period Time for all the ${notificationT.stones_per_period} stones`,
                    notif: notificationT.period_time,
                },
            ],
        },
        simple: { periodtime: [{ name: "Time per move", notif: notificationT.per_move }] },
        absolute: { maintime: [{ name: "Total Time", notif: notificationT.total_time }] },
    };

    return timesObj[notificationT.time_control][mainPeriodTime];
}

function timespanToDisplayString(timespan) {
    const ss = timespan % 60;
    const mm = Math.floor((timespan / 60) % 60);
    const hh = Math.floor((timespan / (60 * 60)) % 24);
    const dd = Math.floor(timespan / (60 * 60 * 24));
    const text = ["days", "hours", "minutes", "seconds"];
    return [dd, hh, mm, ss]
        .map((e, i) => (e === 0 ? "" : `${e} ${text[i]}`))
        .filter((e) => e !== "")
        .join(" ");
}

function getMinMaxMainPeriodTimeRejectResult(mainPeriodTime, notificationT, notificationRanked) {
    const blitzLiveCorr = getBlitzLiveCorr(notificationT.speed);
    const timecontrolObjs = getTimecontrolObjsMainPeriodTime(mainPeriodTime, notificationT);

    if (timecontrolObjs) {
        for (const minMax of ["min", "max"]) {
            const isMin = minMax === "min";
            const argName = getCheckedArgName(
                `${minMax}${mainPeriodTime}${blitzLiveCorr}`,
                notificationRanked,
            );
            if (argName) {
                let arg = config[argName];
                let middleSentence = "";
                if (
                    notificationT.time_control === "canadian" &&
                    mainPeriodTime.includes("periodtime")
                ) {
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
                        return getMinMaxReject(
                            timespanToDisplayString(arg),
                            timespanToDisplayString(notif),
                            isMin,
                            `${notificationT.speed} `,
                            ` in ${notificationT.time_control}`,
                            argName,
                            timecontrolObj.name,
                            middleSentence,
                        );
                    }
                }
            }
        }
    }
}
