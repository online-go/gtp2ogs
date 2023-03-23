import { post, api1 } from "./util";

import { GobanSocket } from "goban/src/GobanSocket";
import { trace } from "./trace";
import { config } from "./config";
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

    socket: GobanSocket;
    games_by_player: { [player_id: string]: Game[] };
    connected: boolean;
    connect_timeout: ReturnType<typeof setTimeout>;
    idle_timeout_interval: ReturnType<typeof setInterval>;
    clock_drift: number;
    network_latency: number;
    ping_interval: ReturnType<typeof setInterval>;
    bot_id: number;
    bot_username: string;
    corr_queue_interval: ReturnType<typeof setInterval>;
    corr_moves_processing: number;

    constructor(socket: GobanSocket) {
        this.socket = socket;

        this.connected_games = {};
        this.games_by_player = {}; // Keep track of connected games per player
        this.connected = false;

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

            socket.send(
                "authenticate",
                {
                    jwt: "",
                    bot_username: config.username,
                    bot_apikey: config.apikey,
                },
                (obj) => {
                    this.bot_id = obj?.id;
                    this.bot_username = obj?.username;
                    if (!this.bot_id) {
                        trace.error(
                            `ERROR: Bot account is unknown to the system: ${config.username}`,
                        );
                        process.exit();
                    }
                    conn_log("Bot is username: ", obj?.username);
                    conn_log("Bot is user id: ", this.bot_id);
                    socket.send("bot/hidden", !!config.hidden);
                },
            );
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
        this.socket.send(
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
            this.socket.send("notification/connect", this.auth({}), (x) => {
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

    // Check challenge entirely, and return reject status + optional error msg.
    //
    on_challenge(notification) {
        const accept = true;
        const rejectmsg = "";

        if (accept) {
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
        this.socket.send("net/ping", { client: new Date().getTime() });
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
        this.socket.send("bot/hidden", true);
    }
    unhide() {
        this.socket.send("bot/hidden", false);
    }
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
