#!/usr/bin/env node
import { WebSocket } from "ws";
(global as any).WebSocket = WebSocket;

import { config } from "./config";
import { socket } from "./socket";
import { trace } from "./trace";
import { post, api1 } from "./util";
import { Game } from "./Game";
import { bot_pools } from "./BotPool";

//process.title = `gtp2ogs ${config.bot_command.join(" ")}`;

const ignorable_notifications = {
    delete: true,
    gameStarted: true,
    gameEnded: true,
    gameDeclined: true,
    gameResumedFromStoneRemoval: true,
    tournamentStarted: true,
    tournamentEnded: true,
};

/** This is the main class for the connection to the server. It is responsible
 * for managing games in play, responding to challenges and notifications, and
 * that sort of stuff. */
class Main {
    notification_connect_interval: ReturnType<typeof setInterval>;
    connected_games: { [game_id: string]: Game };

    //games_by_player: { [player_id: string]: Game[] };
    connected: boolean;
    connect_timeout: ReturnType<typeof setTimeout>;
    idle_timeout_interval: ReturnType<typeof setInterval>;
    ping_interval: ReturnType<typeof setInterval>;
    bot_id: number;
    bot_username: string;
    corr_queue_interval: ReturnType<typeof setInterval>;
    corr_moves_processing: number;

    constructor() {
        this.connected_games = {};
        //this.games_by_player = {}; // Keep track of connected games per player
        this.connected = false;

        if (config.timeout) {
            this.idle_timeout_interval = setInterval(this.disconnectIdleGames.bind(this), 10000);
        }
        if (config.verbosity) {
            setInterval(this.dumpStatus.bind(this), 15 * 60 * 1000);
        }

        socket.on("connect", async () => {
            this.connected = true;

            await bot_pools.main.ready;
            if (bot_pools.resign) {
                await bot_pools.resign.ready;
            }

            socket.send(
                "authenticate",
                {
                    jwt: "",
                    bot_username: config.username,
                    bot_apikey: config.apikey,
                },
                (obj) => {
                    if (!obj) {
                        trace.error(`ERROR: Authentication failed`);
                        process.exit(1);
                    }

                    this.bot_id = obj?.id;
                    this.bot_username = obj?.username;
                    config.bot_id = this.bot_id;
                    config.username = this.bot_username;

                    if (!this.bot_id) {
                        trace.error(
                            `ERROR: Bot account is unknown to the system: ${config.username}`,
                        );
                        process.exit(1);
                    }
                    config.bot_id = this.bot_id;
                    trace.info("Bot is username: ", this.bot_username);
                    trace.info("Bot is user id: ", this.bot_id);
                    if (config.hidden) {
                        trace.info("Bot is hidden");
                    }
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

            trace.info("Disconnected from server");

            for (const game_id in this.connected_games) {
                this.disconnectFromGame(parseInt(game_id));
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
            //trace.trace("active_game:", JSON.stringify(gamedata));

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

                    trace.debug(`game ${gamedata.id} is now finished`);

                    /* XXX We want to disconnect right away here, but there's a game over race condition
                    /      on server side: sometimes /gamedata event with game outcome is sent after
                    /      active_game, so it's lost since there's no game to handle it anymore...
                    /      Work around it with a timeout for now.*/
                    if (!this.connected_games[gamedata.id].disconnect_timeout) {
                        if (config.verbosity) {
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
    connectToGame(game_id: number) {
        if (game_id in this.connected_games) {
            if (config.verbosity) {
                trace.info("Connected to game", game_id, "already");
            }
            return this.connected_games[game_id];
        }

        this.connected_games[game_id] = new Game(game_id);
        this.connected_games[game_id].on("disconnected", (game_id: number) => {
            this.disconnectFromGame(game_id);
        });

        return this.connected_games[game_id];
    }
    disconnectFromGame(game_id: number) {
        if (config.verbosity) {
            trace.info("disconnectFromGame", game_id);
        }
        if (game_id in this.connected_games) {
            this.connected_games[game_id].disconnect();
            delete this.connected_games[game_id];
        }
    }
    disconnectIdleGames() {
        if (config.verbosity) {
            trace.info("Looking for idle games to disconnect");
        }
        for (const k in this.connected_games) {
            const game_id = this.connected_games[k].game_id;
            const state = this.connected_games[game_id].state;
            if (state === null) {
                if (config.verbosity) {
                    trace.info("No game state, not checking idle status for", game_id);
                }
                continue;
            }
            const idle_time = Date.now() - state.clock.last_move;
            if (state.clock.current_player !== this.bot_id && idle_time > config.timeout) {
                if (config.verbosity) {
                    trace.info(
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
        for (const k in this.connected_games) {
            const game_id = this.connected_games[k].game_id;
            const game = this.connected_games[game_id];
            const msg = [];
            msg.push(`game_id = ${game_id}:`);
            if (game.state === null) {
                msg.push("no_state");
                trace.info(...msg);
                continue;
            }
            msg.push(`black = ${game.state.players.black.username}`);
            msg.push(`white = ${game.state.players.white.username}`);
            if (game.state.clock.current_player === this.bot_id) {
                msg.push("bot_turn");
            }
            const idle_time = (Date.now() - game.state.clock.last_move) / 1000;
            msg.push(`idle_time = ${idle_time}s`);
            /*
            if (game.bot === null) {
                msg.push("no_bot");
                trace.info(...msg);
                continue;
            }
            msg.push(`bot.proc.pid = ${game.bot.pid}`);
            msg.push(`bot.dead = ${game.bot.dead}`);
            msg.push(`bot.failed = ${game.bot.failed}`);
            */
            trace.info(...msg);
        }
    }
    deleteNotification(notification) {
        socket.send("notification/delete", { notification_id: notification.id }, () => {
            trace.info("Deleted notification ", notification.id);
        });
    }
    /*
    connection_reset() {
        for (const game_id in this.connected_games) {
            this.disconnectFromGame(game_id);
        }
        if (socket) {
            socket.send("notification/connect", {}, (x) => {
                trace.info(x);
            });
        }
    }
    */
    on_friendRequest(notification) {
        trace.log("Friend request from ", notification.user.username);
        post(api1("me/friends/invitations"), { from_user: notification.user.id })
            .then((obj) => trace.info(obj.body))
            .catch(trace.info);
    }

    on_challenge(notification) {
        const accept = true;
        const rejectmsg = "";

        if (accept) {
            post(api1(`me/challenges/${notification.challenge_id}/accept`), {})
                .then(ignore)
                .catch(() => {
                    trace.info("Error accepting challenge, declining it");
                    post(api1(`me/challenges/${notification.challenge_id}`), {
                        delete: true,
                        message: "Error accepting game challenge, challenge has been removed.",
                    })
                        .then(ignore)
                        .catch(trace.info);
                    this.deleteNotification(notification);
                });
        } else {
            post(api1(`me/challenges/${notification.challenge_id}`), {
                delete: true,
                message: rejectmsg || "The AI you've challenged has rejected this game.",
            })
                .then(ignore)
                .catch(trace.info);
        }
    }
    terminate() {
        clearTimeout(this.connect_timeout);
        clearInterval(this.ping_interval);
        clearInterval(this.notification_connect_interval);
        clearInterval(this.corr_queue_interval);
    }
    hide() {
        socket.send("bot/hidden", true);
    }
    unhide() {
        socket.send("bot/hidden", false);
    }
}

function ignore() {
    // do nothing
}

new Main();
