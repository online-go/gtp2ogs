#!/usr/bin/env node
import { WebSocket } from "ws";
(global as any).WebSocket = WebSocket;

import { config, TimeControlRanges } from "./config";
import { socket } from "./socket";
import { trace } from "./trace";
import { post, api1 } from "./util";
import { Game } from "./Game";
import { bot_pools } from "./pools";
import { JGOFTimeControl } from "goban/src/JGOF";

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
                    /*
                        {
                          id: '54337:e911260c-b102-4da1-b8a5-a4619f28375d',
                          type: 'challenge',
                          player_id: 54337,
                          timestamp: 1680208777,
                          read_timestamp: 0,
                          read: 0,
                          aux_delivered: 0,
                          game_id: 51749509,
                          challenge_id: 19684526,
                          user: {
                            id: 1,
                            country: 'us',
                            username: 'anoek',
                            icon_url: 'https://b0c2ddc39d13e1c0ddad-93a52a5bc9e7cc06050c1a999beb3694.ssl.cf1.rackcdn.com/09ea48b349cad5d5f27e07f5e0177803-32.png',
                            ratings: { version: 5, overall: [Object] },
                            ui_class: 'supporter moderator admin',
                            professional: false,
                            rating: 1231.0717333889886,
                            ranking: 19.729405410145198
                          },
                          rules: 'chinese',
                          ranked: false,
                          aga_rated: false,
                          disable_analysis: false,
                          handicap: 0,
                          komi: null,
                          time_control: {
                            system: 'byoyomi',
                            time_control: 'byoyomi',
                            speed: 'correspondence',
                            pause_on_weekends: true,
                            main_time: 604800,
                            period_time: 86400,
                            periods: 5
                          },
                          challenger_color: 'black',
                          width: 19,
                          height: 19
                        }
                    */

                    let reject: string | undefined =
                        this.checkBlacklist(notification.user) ||
                        this.checkTimeControl(notification.time_control) ||
                        this.checkBoardSize(notification.width, notification.height) ||
                        this.checkHandicap(notification.handicap) ||
                        this.checkRanked(notification.ranked);

                    if (this.checkWhitelist(notification.user)) {
                        reject = undefined;
                    }

                    trace.log("Challenge received: ", notification);

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
                        post(api1(`me/challenges/${notification.challenge_id}`), {
                            delete: true,
                            message: reject || "The AI you've challenged has rejected this game.",
                        })
                            .then(ignore)
                            .catch(trace.info);
                    }
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

    checkBlacklist(user: { id: number; username: string }): string | undefined {
        if (!config.blacklist) {
            return undefined;
        }
        if (config.blacklist.includes(user.id) || config.blacklist.includes(user.username)) {
            return `The operator of this bot will not let you play against it.`;
        }
        return undefined;
    }
    checkWhitelist(user: { id: number; username: string }): boolean {
        if (!config.whitelist) {
            return false;
        }
        if (config.whitelist.includes(user.id) || config.whitelist.includes(user.username)) {
            return true;
        }
        return false;
    }
    checkBoardSize(width: number, height: number): string | undefined {
        const allowed = Array.isArray(config.allowed_board_sizes)
            ? config.allowed_board_sizes
            : [config.allowed_board_sizes];

        if (allowed.includes("all")) {
            return undefined;
        }

        if (allowed.includes("square") && width === height) {
            return undefined;
        }

        if (width !== height) {
            return `This bot only plays square boards.`;
        }

        if (!allowed.includes(width)) {
            return `This bot only plays on these board sizes: ${allowed
                .map((x) => `${x}x${x}`)
                .join(", ")}.`;
        }

        return undefined;
    }
    checkHandicap(handicap: number): string | undefined {
        if (!config.allowed_handicap && handicap !== 0) {
            return `This bot only plays games with no handicap.`;
        }
        return undefined;
    }
    checkRanked(ranked: boolean): string | undefined {
        if (!ranked && !config.allow_unranked) {
            return `This bot only plays ranked games.`;
        }

        return undefined;
    }
    checkTimeControl(time_control: JGOFTimeControl): string | undefined {
        if (!config.allowed_time_control_systems.includes(time_control.system as any)) {
            return `This bot only plays games with time control system ${config.allowed_time_control_systems.join(
                ", ",
            )}.`;
        }

        let settings: TimeControlRanges | undefined;
        switch (time_control.speed) {
            case "blitz":
                if (!config.allowed_blitz_settings) {
                    return `This bot does not play blitz games.`;
                }
                settings = config.allowed_blitz_settings;
                break;
            case "live":
                if (!config.allowed_live_settings) {
                    return `This bot does not play live games.`;
                }
                settings = config.allowed_live_settings;
                break;
            case "correspondence":
                if (!config.allowed_correspondence_settings) {
                    return `This bot does not play correspondence games.`;
                }
                settings = config.allowed_correspondence_settings;
                break;
            default:
                // should be unreachable
                return `This bot does not play games with the provided time control speed`;
        }

        if (settings) {
            switch (time_control.system) {
                case "fischer":
                    if (
                        time_control.time_increment < settings.per_move_time_range[0] ||
                        time_control.time_increment > settings.per_move_time_range[1]
                    ) {
                        return `Time increment is out of acceptable range`;
                    }
                    break;

                case "byoyomi":
                    if (
                        time_control.period_time < settings.per_move_time_range[0] ||
                        time_control.period_time > settings.per_move_time_range[1]
                    ) {
                        return `Period time is out of acceptable range`;
                    }
                    if (
                        time_control.periods < settings.periods_range[0] ||
                        time_control.periods > settings.periods_range[1]
                    ) {
                        return `Periods is out of acceptable range`;
                    }
                    if (
                        time_control.main_time < settings.main_time_range[0] ||
                        time_control.main_time > settings.main_time_range[1]
                    ) {
                        return `Main time is out of acceptable range`;
                    }
                    break;

                case "simple":
                    if (
                        time_control.per_move < settings.per_move_time_range[0] ||
                        time_control.per_move > settings.per_move_time_range[1]
                    ) {
                        return `Per move time is out of acceptable range`;
                    }
                    break;

                default:
                    return `This bot does not play games with time control system ${time_control.system}.`;
            }
        }

        return undefined;
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
