#!/usr/bin/env node
import { WebSocket } from "ws";
(global as any).WebSocket = WebSocket;

import { config, config_event_emitter } from "./config";
import { socket } from "./socket";
import { trace } from "./trace";
import { post, api1 } from "./util";
import { Game, handleChatLine } from "./Game";
import { bot_pools } from "./pools";
import { protocol } from "goban-engine";
import { Speed } from "../types";
import { ChallengeValidator } from "../lib/challenge-validator";

//process.title = `gtp2ogs ${config.bot_command.join(" ")}`;

const ignorable_notifications = {
    delete: true,
    gameStarted: true,
    gameEnded: true,
    gameDeclined: true,
    gameResumedFromStoneRemoval: true,
    tournamentStarted: true,
    tournamentEnded: true,
    aiReviewDone: true,
};

/** This is the main class for the connection to the server. It is responsible
 * for managing games in play, responding to challenges and notifications, and
 * that sort of stuff. */
class Main {
    notification_connect_interval: ReturnType<typeof setInterval>;
    connected_games: { [game_id: string]: Game };
    connected_finished_games: { [game_id: string]: boolean };

    //games_by_player: { [player_id: string]: Game[] };
    connected: boolean;
    connect_timeout: ReturnType<typeof setTimeout>;
    idle_timeout_interval: ReturnType<typeof setInterval>;
    ping_interval: ReturnType<typeof setInterval>;
    bot_id: number;
    bot_username: string;
    private last_status_update: { [key: string]: number } = {};
    private challenge_validator: ChallengeValidator;

    constructor() {
        this.connected_games = {};
        this.connected_finished_games = {};
        //this.games_by_player = {}; // Keep track of connected games per player
        this.connected = false;

        if (config.status_update_frequency > 0) {
            setInterval(this.dumpStatus.bind(this), config.status_update_frequency);
        }
        setInterval(this.sendStatusUpdate.bind(this), 100);

        socket.on("connect", async () => {
            this.connected = true;

            await bot_pools.main.ready;
            if (bot_pools.ending) {
                await bot_pools.ending.ready;
            }
            if (bot_pools.opening) {
                await bot_pools.opening.ready;
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

                    // Initialize challenge validator
                    this.challenge_validator = new ChallengeValidator(
                        config,
                        (speed: string) => this.countGames(speed as Speed),
                        (player_id: number) => this.countGamesForPlayer(player_id),
                    );

                    const config_v2: protocol.BotConfigV2 = {
                        hidden: false,
                        ...config,
                        _config_version: 2,
                    } as protocol.BotConfigV2;
                    socket.send("bot/config", config_v2);
                },
            );
        });

        config_event_emitter.on("reloaded", () => {
            config.bot_id = this.bot_id;
            config.username = this.bot_username;

            // Reinitialize challenge validator with new config
            this.challenge_validator = new ChallengeValidator(
                config,
                (speed: string) => this.countGames(speed as Speed),
                (player_id: number) => this.countGamesForPlayer(player_id),
            );

            if (socket.connected) {
                socket.send("bot/config", {
                    hidden: false,
                    ...config,
                    _config_version: 2,
                } as protocol.BotConfigV2);
            }
        });

        socket.on("disconnect", () => {
            this.connected = false;

            trace.warn("Disconnected from server");

            for (const game_id in this.connected_games) {
                this.disconnectFromGame(parseInt(game_id));
            }
        });

        socket.on("notification", (notification) => this.handleNotification(notification));

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
            return this.connected_games[game_id];
        } else {
            trace.info("Connecting to game ", game_id);
        }

        this.connected_games[game_id] = new Game(game_id);
        this.connected_games[game_id].on("disconnected", (game_id: number) => {
            this.disconnectFromGame(game_id);
        });

        return this.connected_games[game_id];
    }
    disconnectFromGame(game_id: number) {
        trace.info("Disconnecting from game ", game_id);
        if (game_id in this.connected_games) {
            this.connected_games[game_id].disconnect();
            delete this.connected_games[game_id];
        }
    }
    dumpStatus() {
        const blitz_count = this.countGames("blitz");
        const rapid_count = this.countGames("rapid");
        const live_count = this.countGames("live");
        const corr_count = this.countGames("correspondence");

        trace.info(
            `Status: playing ${blitz_count} blitz, ${rapid_count} rapid, ${live_count} live, ${corr_count} correspondence games`,
        );

        let str = "Bot status: ";
        for (const n of ["main", "ending", "opening"]) {
            const pool = bot_pools[n];
            if (!pool) {
                continue;
            }

            str += pool.stateString() + " ";
        }

        trace.info(str);
    }

    /** Send the server our current status */
    private sendStatusUpdate() {
        const update = {
            ongoing_blitz_count: this.countGames("blitz"),
            ongoing_rapid_count: this.countGames("rapid"),
            ongoing_live_count: this.countGames("live"),
            ongoing_correspondence_count: this.countGames("correspondence"),
        };

        if (
            update["ongoing_blitz_count"] !== this.last_status_update["ongoing_blitz_count"] ||
            update["ongoing_rapid_count"] !== this.last_status_update["ongoing_rapid_count"] ||
            update["ongoing_live_count"] !== this.last_status_update["ongoing_live_count"] ||
            update["ongoing_correspondence_count"] !==
                this.last_status_update["ongoing_correspondence_count"]
        ) {
            socket.send("bot/status", update);
            this.last_status_update = update;
        }
    }

    countGames(speed: Speed) {
        return Object.values(this.connected_games).filter(
            (g) => g?.state?.time_control?.speed === speed && !g?.paused,
        ).length;
    }

    countGamesForPlayer(player_id: number): number {
        return Object.keys(this.connected_games).filter((game_id) => {
            const state = this.connected_games[game_id]?.state;
            if (state?.player_pool !== undefined) {
                return !!state.player_pool[player_id];
            }
            return state?.white_player_id === player_id || state?.black_player_id === player_id;
        }).length;
    }

    deleteNotification(notification) {
        socket.send("notification/delete", { notification_id: notification.id }, () => {
            trace.trace("Deleted notification ", notification.id);
        });
    }

    handleNotification(notification): void {
        switch (notification.type) {
            case "friendRequest":
                {
                    trace.log("Friend request from ", notification.user.username);
                    post(api1("me/friends/invitations"), { from_user: notification.user.id })
                        .then((obj) => trace.info(obj.body))
                        .catch(trace.info);
                }
                break;

            case "challenge":
                {
                    const reject = this.challenge_validator.validateChallenge(notification);

                    if (!reject) {
                        post(api1(`me/challenges/${notification.challenge_id}/accept`), {})
                            .then(ignore)
                            .catch(() => {
                                trace.info("Error accepting challenge, declining it");
                                post(api1(`me/challenges/${notification.challenge_id}`), {
                                    delete: true,
                                    message:
                                        "Error accepting game challenge, challenge has been removed.",
                                })
                                    .then(ignore)
                                    .catch(trace.info);
                                this.deleteNotification(notification);
                            });
                    } else {
                        trace.info(
                            `Rejecting challenge from ${notification.user.username} https://online-go.com/player/${notification.user.id}`,
                            reject,
                        );
                        post(api1(`me/challenges/${notification.challenge_id}`), {
                            delete: true,
                            message: reject.message,
                            rejection_details: reject,
                        })
                            .then(ignore)
                            .catch(trace.info);
                    }
                }
                break;

            case "lateChatReceivedInGame":
                {
                    this.deleteNotification(notification);
                    if (!config.log_game_chat) {
                        break;
                    }
                    const game_id = notification.game_id;
                    if (game_id in this.connected_finished_games) {
                        // Already connected to the finished game.
                        break;
                    }

                    trace.debug(`Connecting to ${game_id} to receive late chats`);
                    socket.send("chat/join", {
                        channel: `game-${game_id}`,
                    });
                    const on_chat = (chat) => {
                        handleChatLine(game_id, chat.line, notification.timestamp - 1);
                    };
                    socket.on(`game/${game_id}/chat`, on_chat);

                    // Connecting to a game from outside Game deserves a little
                    // bit of care, but I think it should be OK, because
                    // lateChatReceivedInGame implies the game is over, so we
                    // should not be getting in the way of anything here.
                    //
                    // We could connect to the game as we usually do, but this
                    // would confuse the logic there that expects to handle an
                    // unfinished game.
                    this.connected_finished_games[game_id] = true;
                    socket.send("game/connect", {
                        game_id: game_id,
                        chat: true,
                    });
                    setTimeout(() => {
                        trace.debug(`Disconnecting from ${game_id} (chats)`);
                        delete this.connected_finished_games[game_id];
                        socket.send("game/disconnect", {
                            game_id: game_id,
                        });
                        socket.off(`game/${game_id}/chat`, on_chat);
                    }, 5000);
                }
                break;

            default:
                {
                    if (!(notification.type in ignorable_notifications)) {
                        trace.log("Unhandled notification type: ", notification.type, notification);
                    }
                    if (notification.type !== "delete") {
                        this.deleteNotification(notification);
                    }
                }
                break;
        }
    }

    terminate() {
        clearTimeout(this.connect_timeout);
        clearInterval(this.ping_interval);
        clearInterval(this.notification_connect_interval);
    }
}

function ignore() {
    // do nothing
}

new Main();
