#!/usr/bin/env node
import { WebSocket } from "ws";
(global as any).WebSocket = WebSocket;

import { config, config_event_emitter, TimeControlRanges } from "./config";
import { socket } from "./socket";
import { trace } from "./trace";
import { post, api1 } from "./util";
import { Game, handleChatLine } from "./Game";
import { bot_pools } from "./pools";
import { JGOFTimeControl, protocol } from "goban-engine";
import { Speed } from "./types";

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

interface RejectionDetails {
    message: string;
    /* NOTE: If additional rejection_codes are added, you must also add
     * them https://github.com/online-go/online-go.com/blob/devel/src/components/ChallengeModal/ChallengeModal.tsx
     * so that appropriate translated messages are displayed to the user.
     */
    rejection_code:
        | "blacklisted"
        | "board_size_not_square"
        | "board_size_not_allowed"
        | "handicap_not_allowed"
        | "unranked_not_allowed"
        | "ranked_not_allowed"
        | "blitz_not_allowed"
        | "too_many_blitz_games"
        | "rapid_not_allowed"
        | "too_many_rapid_games"
        | "live_not_allowed"
        | "too_many_live_games"
        | "correspondence_not_allowed"
        | "too_many_correspondence_games"
        | "time_control_system_not_allowed"
        | "time_increment_out_of_range"
        | "period_time_out_of_range"
        | "periods_out_of_range"
        | "main_time_out_of_range"
        | "max_time_out_of_range"
        | "per_move_time_out_of_range"
        | "player_rank_out_of_range"
        | "not_accepting_new_challenges"
        | "too_many_games_for_player"
        | "komi_out_of_range";
    details: {
        [key: string]: any;
    };
}

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
            (g) => g?.state?.time_control?.speed === speed,
        ).length;
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
                    let reject: RejectionDetails | undefined =
                        this.checkBlacklist(notification.user) ||
                        this.checkTimeControl(notification.time_control) ||
                        this.checkConcurrentGames(notification.time_control.speed) ||
                        this.checkBoardSize(notification.width, notification.height) ||
                        this.checkHandicap(notification.ranked, notification.handicap) ||
                        this.checkRanked(notification.ranked) ||
                        this.checkAllowedRank(notification.ranked, notification.min_ranking) ||
                        this.checkDeclineChallenges() ||
                        this.checkGamesPerPlayer(notification.user?.id) ||
                        this.checkKomi(notification.komi) ||
                        undefined;

                    if (this.checkWhitelist(notification.user)) {
                        reject = undefined;
                    }

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

    checkBlacklist(user: { id: number; username: string }): RejectionDetails | undefined {
        if (!config.blacklist) {
            return undefined;
        }
        if (config.blacklist.includes(user.id) || config.blacklist.includes(user.username)) {
            return {
                message: `The operator of this bot will not let you play against it.`,
                rejection_code: "blacklisted",
                details: {},
            };
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
    checkBoardSize(width: number, height: number): RejectionDetails | undefined {
        // handle explicit board size ranges
        if (
            typeof config.allowed_board_sizes === "object" &&
            "width_range" in config.allowed_board_sizes &&
            "height_range" in config.allowed_board_sizes
        ) {
            if (
                width < config.allowed_board_sizes.width_range[0] ||
                width > config.allowed_board_sizes.width_range[1] ||
                height < config.allowed_board_sizes.height_range[0] ||
                height > config.allowed_board_sizes.height_range[1]
            ) {
                return {
                    message:
                        `This bot only supports board sizes between ` +
                        `${config.allowed_board_sizes.width_range[0]}x${config.allowed_board_sizes.height_range[0]} ` +
                        `and ${config.allowed_board_sizes.width_range[1]}x${config.allowed_board_sizes.height_range[1]}.`,
                    rejection_code: "board_size_not_allowed",
                    details: {
                        width,
                        height,
                        width_range: config.allowed_board_sizes.width_range,
                        height_range: config.allowed_board_sizes.height_range,
                    },
                };
            } else {
                return undefined;
            }
        }

        // Handle normal sizes or special "all" | "square" cases
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
            return {
                message: `This bot only plays square boards.`,
                rejection_code: "board_size_not_square",
                details: { width, height },
            };
        }

        if (!allowed.includes(width)) {
            return {
                message: `This bot only plays on these board sizes: ${allowed
                    .map((x) => `${x}x${x}`)
                    .join(", ")}.`,
                rejection_code: "board_size_not_allowed",
                details: { width, height },
            };
        }

        return undefined;
    }
    checkHandicap(ranked: number, handicap: number): RejectionDetails | undefined {
        if (
            !(ranked ? config.allow_ranked_handicap : config.allow_unranked_handicap) &&
            handicap !== 0
        ) {
            return {
                message: `This bot only plays games with no handicap.`,
                rejection_code: "handicap_not_allowed",
                details: { handicap },
            };
        }
        return undefined;
    }
    checkRanked(ranked: boolean): RejectionDetails | undefined {
        if (!ranked && !config.allow_unranked) {
            return {
                message: `This bot only plays ranked games.`,
                rejection_code: "unranked_not_allowed",
                details: { ranked },
            };
        }

        if (ranked && !config.allow_ranked) {
            return {
                message: `This bot only plays unranked games.`,
                rejection_code: "ranked_not_allowed",
                details: { ranked },
            };
        }

        return undefined;
    }
    checkConcurrentGames(speed: Speed): RejectionDetails | undefined {
        const count = this.countGames(speed);
        switch (speed) {
            case "blitz":
                if (!config.allowed_blitz_settings?.concurrent_games) {
                    return {
                        message: `This bot does not play blitz games.`,
                        rejection_code: "blitz_not_allowed",
                        details: {},
                    };
                }
                if (count >= (config.allowed_blitz_settings?.concurrent_games || 0)) {
                    return {
                        message: `This bot is already playing ${count} of ${
                            config.allowed_blitz_settings?.concurrent_games || 0
                        } allowed blitz games.`,
                        rejection_code: "too_many_blitz_games",
                        details: {
                            count,
                            allowed: config.allowed_blitz_settings?.concurrent_games || 0,
                        },
                    };
                }
                break;

            case "rapid":
                if (!config.allowed_rapid_settings?.concurrent_games) {
                    return {
                        message: `This bot does not play rapid games.`,
                        rejection_code: "rapid_not_allowed",
                        details: {},
                    };
                }
                if (count >= (config.allowed_rapid_settings?.concurrent_games || 0)) {
                    return {
                        message: `This bot is already playing ${count} of ${
                            config.allowed_rapid_settings?.concurrent_games || 0
                        } allowed rapid games.`,
                        rejection_code: "too_many_rapid_games",
                        details: {
                            count,
                            allowed: config.allowed_rapid_settings?.concurrent_games || 0,
                        },
                    };
                }
                break;

            case "live":
                if (!config.allowed_live_settings?.concurrent_games) {
                    return {
                        message: `This bot does not play live games.`,
                        rejection_code: "live_not_allowed",
                        details: {},
                    };
                }
                if (count >= (config.allowed_live_settings?.concurrent_games || 0)) {
                    return {
                        message: `This bot is already playing ${count} of ${
                            config.allowed_live_settings?.concurrent_games || 0
                        } allowed live games.`,
                        rejection_code: "too_many_live_games",
                        details: {
                            count,
                            allowed: config.allowed_live_settings?.concurrent_games || 0,
                        },
                    };
                }
                break;

            case "correspondence":
                if (!config.allowed_correspondence_settings?.concurrent_games) {
                    return {
                        message: `This bot does not play correspondence games.`,
                        rejection_code: "correspondence_not_allowed",
                        details: {},
                    };
                }
                if (count >= (config.allowed_correspondence_settings?.concurrent_games || 0)) {
                    return {
                        message: `This bot is already playing ${count} of ${
                            config.allowed_correspondence_settings?.concurrent_games || 0
                        } allowed correspondence games.`,
                        rejection_code: "too_many_correspondence_games",
                        details: {
                            count,
                            allowed: config.allowed_correspondence_settings?.concurrent_games || 0,
                        },
                    };
                }
                break;
        }
        return undefined;
    }
    checkTimeControl(time_control: JGOFTimeControl): RejectionDetails | undefined {
        if (!config.allowed_time_control_systems.includes(time_control.system as any)) {
            return {
                message: `This bot only plays games with time control system ${config.allowed_time_control_systems.join(
                    ", ",
                )}.`,
                rejection_code: "time_control_system_not_allowed",
                details: { time_control_system: time_control.system },
            };
        }

        let settings: TimeControlRanges | undefined;
        switch (time_control.speed) {
            case "blitz":
                if (!config.allowed_blitz_settings) {
                    return {
                        message: `This bot does not play blitz games.`,
                        rejection_code: "blitz_not_allowed",
                        details: {},
                    };
                }
                settings = config.allowed_blitz_settings;
                break;

            case "rapid":
                if (!config.allowed_rapid_settings) {
                    return {
                        message: `This bot does not play rapid games.`,
                        rejection_code: "rapid_not_allowed",
                        details: {},
                    };
                }
                settings = config.allowed_rapid_settings;
                break;

            case "live":
                if (!config.allowed_live_settings) {
                    return {
                        message: `This bot does not play live games.`,
                        rejection_code: "live_not_allowed",
                        details: {},
                    };
                }
                settings = config.allowed_live_settings;
                break;
            case "correspondence":
                if (!config.allowed_correspondence_settings) {
                    return {
                        message: `This bot does not play correspondence games.`,
                        rejection_code: "correspondence_not_allowed",
                        details: {},
                    };
                }
                settings = config.allowed_correspondence_settings;
                break;
        }

        if (settings) {
            switch (time_control.system) {
                case "fischer":
                    if (
                        time_control.max_time < settings.fischer.max_time_range[0] ||
                        time_control.max_time > settings.fischer.max_time_range[1]
                    ) {
                        return {
                            message: `Max time is out of acceptable range`,
                            rejection_code: "max_time_out_of_range",
                            details: {
                                max_time: time_control.max_time,
                                range: settings.fischer.max_time_range,
                            },
                        };
                    }
                    if (
                        time_control.time_increment < settings.fischer.time_increment_range[0] ||
                        time_control.time_increment > settings.fischer.time_increment_range[1]
                    ) {
                        return {
                            message: `Time increment is out of acceptable range`,
                            rejection_code: "time_increment_out_of_range",
                            details: {
                                time_increment: time_control.time_increment,
                                range: settings.fischer.time_increment_range,
                            },
                        };
                    }
                    break;

                case "byoyomi":
                    if (
                        time_control.period_time < settings.byoyomi.period_time_range[0] ||
                        time_control.period_time > settings.byoyomi.period_time_range[1]
                    ) {
                        return {
                            message: `Period time is out of acceptable range`,
                            rejection_code: "period_time_out_of_range",
                            details: {
                                period_time: time_control.period_time,
                                range: settings.byoyomi.period_time_range,
                            },
                        };
                    }
                    if (
                        time_control.periods < settings.byoyomi.periods_range[0] ||
                        time_control.periods > settings.byoyomi.periods_range[1]
                    ) {
                        return {
                            message: `Periods is out of acceptable range`,
                            rejection_code: "periods_out_of_range",
                            details: {
                                periods: time_control.periods,
                                range: settings.byoyomi.periods_range,
                            },
                        };
                    }
                    if (
                        time_control.main_time < settings.byoyomi.main_time_range[0] ||
                        time_control.main_time > settings.byoyomi.main_time_range[1]
                    ) {
                        return {
                            message: `Main time is out of acceptable range`,
                            rejection_code: "main_time_out_of_range",
                            details: {
                                main_time: time_control.main_time,
                                range: settings.byoyomi.main_time_range,
                            },
                        };
                    }
                    break;

                case "simple":
                    if (
                        time_control.per_move < settings.simple.per_move_time_range[0] ||
                        time_control.per_move > settings.simple.per_move_time_range[1]
                    ) {
                        return {
                            message: `Per move time is out of acceptable range`,
                            rejection_code: "per_move_time_out_of_range",
                            details: {
                                per_move_time: time_control.per_move,
                                range: settings.simple.per_move_time_range,
                            },
                        };
                    }
                    break;

                default:
                    return {
                        message: `This bot does not play games with time control system ${time_control.system}.`,
                        rejection_code: "time_control_system_not_allowed",
                        details: { time_control_system: time_control.system },
                    };
            }
        }

        return undefined;
    }
    checkAllowedRank(game_is_ranked: boolean, player_rank: number): RejectionDetails | undefined {
        const min_rank = rankstr_to_number(config.allowed_rank_range[0]);
        const max_rank = rankstr_to_number(config.allowed_rank_range[1]);

        if (!game_is_ranked) {
            return;
        }
        if (player_rank < min_rank || player_rank > max_rank) {
            return {
                rejection_code: "player_rank_out_of_range",
                details: {
                    allowed_rank_range: config.allowed_rank_range,
                },
                message:
                    player_rank < min_rank
                        ? `Your rank is too low to play against this bot.`
                        : `Your rank is too high to play against this bot.`,
            };
        }
    }
    checkDeclineChallenges(): RejectionDetails | undefined {
        if (config.decline_new_challenges) {
            return {
                rejection_code: "not_accepting_new_challenges",
                details: {},
                message: "This bot is not accepting new challenges at this time.",
            };
        }
    }
    checkGamesPerPlayer(player_id: number): RejectionDetails | undefined {
        trace.log("Max games per player: ", config.max_games_per_player);
        //config;
        if (config.max_games_per_player) {
            const game_count = Object.keys(this.connected_games).filter((game_id) => {
                const state = this.connected_games[game_id]?.state;
                if (state?.player_pool !== undefined) {
                    return !!state.player_pool[player_id];
                }
                return state?.white_player_id === player_id || state?.black_player_id === player_id;
            }).length;
            trace.log("Game count: ", game_count, " for ", player_id);
            if (game_count >= config.max_games_per_player) {
                return {
                    rejection_code: "too_many_games_for_player",
                    details: {
                        games_being_played: game_count,
                        max_games_per_player: config.max_games_per_player,
                    },
                    message: `You already have ${game_count} games against this bot. This bot only allows ${config.max_games_per_player} games per player, please end your other games before starting a new one.`,
                };
            }
        }
    }
    checkKomi(komi: number): RejectionDetails | undefined {
        if (komi < config.allowed_komi_range[0] || komi > config.allowed_komi_range[1]) {
            return {
                rejection_code: "komi_out_of_range",
                details: {
                    allowed_komi_range: config.allowed_komi_range,
                },
                message: `Komi is out of acceptable range`,
            };
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

function rankstr_to_number(rank: string): number {
    const base = parseInt(rank);
    const suffix = rank[rank.length - 1].toLowerCase();

    switch (suffix) {
        case "p":
            return 999;
        case "k":
            return 30 - base;
        case "d":
            return 29 + base;
    }

    throw new Error(`Invalid rank string: ${rank}`);
}

new Main();
