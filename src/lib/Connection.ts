import { WebSocket } from "ws";
import { GobanSocket, protocol } from "goban-engine";
import { EventEmitter } from "eventemitter3";
import { trace } from "./trace";
import { Game } from "./Game";
import { ChallengeValidator, RejectionDetails } from "./challenge-validator";
import { post, api1 } from "./http-util";

global.performance = global.performance || (Date as any);

export interface ConnectionConfig {
    /** API key for the bot */
    apikey: string;
    /** Username for the bot */
    username?: string;
    /** Server URL to connect to
     * @default https://online-go.com
     */
    server?: string;
    /** Bot configuration to send to the server
     * This can be a full config loaded from a .json5 file using loadConfig()
     */
    bot_config?: Partial<protocol.BotConfigV2> | any;
}

interface Events {
    connect: () => void;
    disconnect: () => void;
    game: (game: Game) => void;
    authenticated: (bot_id: number, bot_username: string) => void;
}

const MIN_CONNECT_TIME = 1000;

/** Manages the connection to the OGS server */
export class Connection extends EventEmitter<Events> {
    private socket: GobanSocket;
    private config: ConnectionConfig;
    private connected_games: { [game_id: string]: Game } = {};
    private connected_finished_games: { [game_id: string]: boolean } = {};
    public connected: boolean = false;
    public bot_id: number;
    public bot_username: string;
    private connect_time: number = 0;
    private challenge_validator: ChallengeValidator | null = null;

    constructor(config: ConnectionConfig) {
        super();

        (global as any).WebSocket = WebSocket;

        this.config = {
            server: "https://online-go.com",
            ...config,
        };

        this.socket = new GobanSocket(this.config.server);
        this.setupSocketHandlers();
    }

    private setupSocketHandlers() {
        this.socket.on("ERROR", (message) => {
            trace.error(message);
        });

        this.socket.on("connect", () => {
            this.connect_time = performance.now() - this.connect_time;
            trace.info(`Connected to ${this.config.server} in ${this.connect_time.toFixed(0)}ms`);
            this.connected = true;
            this.authenticate();
        });

        this.socket.on("disconnect", () => {
            if (performance.now() - this.connect_time < MIN_CONNECT_TIME) {
                process.exit(1);
            }

            this.connected = false;
            trace.warn("Disconnected from server");

            for (const game_id in this.connected_games) {
                this.disconnectFromGame(parseInt(game_id));
            }

            this.emit("disconnect");
        });

        this.socket.on("active_game", (gamedata) => {
            if (gamedata.phase === "finished") {
                if (gamedata.id in this.connected_games) {
                    trace.debug(`game ${gamedata.id} is now finished`);

                    if (!this.connected_games[gamedata.id].disconnect_timeout) {
                        this.connected_games[gamedata.id].disconnect_timeout = setTimeout(() => {
                            this.disconnectFromGame(gamedata.id);
                        }, 1000);
                    }
                }
                return;
            }

            this.connectToGame(gamedata.id);
        });

        this.socket.on("notification", (notification) => this.handleNotification(notification));
    }

    private authenticate() {
        this.socket.send(
            "authenticate",
            {
                jwt: "",
                bot_username: this.config.username,
                bot_apikey: this.config.apikey,
            },
            (obj) => {
                if (!obj) {
                    trace.error(`ERROR: Authentication failed`);
                    throw new Error("Authentication failed");
                }

                this.bot_id = obj?.id;
                this.bot_username = obj?.username;

                if (!this.bot_id) {
                    trace.error(
                        `ERROR: Bot account is unknown to the system: ${this.config.username}`,
                    );
                    throw new Error("Unknown bot account");
                }

                trace.info("Bot is username: ", this.bot_username);
                trace.info("Bot is user id: ", this.bot_id);

                const config_v2: protocol.BotConfigV2 = {
                    hidden: false,
                    ...this.config.bot_config,
                    _config_version: 2,
                } as protocol.BotConfigV2;

                this.socket.send("bot/config", config_v2);

                // Initialize challenge validator if config is provided
                if (this.config.bot_config) {
                    this.challenge_validator = new ChallengeValidator(
                        this.config.bot_config,
                        (speed: string) => this.countGames(speed),
                        (player_id: number) => this.countGamesForPlayer(player_id),
                    );
                }

                this.emit("authenticated", this.bot_id, this.bot_username);
                this.emit("connect");
            },
        );
    }

    /** Connect to the server */
    async connect(): Promise<void> {
        this.connect_time = performance.now();
        return new Promise((resolve) => {
            this.once("connect", resolve);
        });
    }

    /** Disconnect from the server */
    disconnect() {
        for (const game_id in this.connected_games) {
            this.disconnectFromGame(parseInt(game_id));
        }
        this.socket.disconnect();
    }

    /** Get the underlying socket for advanced usage */
    getSocket(): GobanSocket {
        return this.socket;
    }

    private connectToGame(game_id: number) {
        if (game_id in this.connected_games) {
            return this.connected_games[game_id];
        }

        trace.info("Connecting to game ", game_id);

        this.connected_games[game_id] = new Game(game_id, this.socket, this.bot_id);
        this.connected_games[game_id].on("disconnected", (game_id: number) => {
            this.disconnectFromGame(game_id);
        });

        this.emit("game", this.connected_games[game_id]);

        return this.connected_games[game_id];
    }

    private disconnectFromGame(game_id: number) {
        trace.info("Disconnecting from game ", game_id);
        if (game_id in this.connected_games) {
            this.connected_games[game_id].disconnect();
            delete this.connected_games[game_id];
        }
    }

    /** Get a connected game by ID */
    getGame(game_id: number): Game | undefined {
        return this.connected_games[game_id];
    }

    /** Get all connected games */
    getGames(): Game[] {
        return Object.values(this.connected_games);
    }

    /** Count games by speed */
    private countGames(speed: string): number {
        return Object.values(this.connected_games).filter(
            (g) => g?.state?.time_control?.speed === speed,
        ).length;
    }

    /** Count games for a specific player */
    private countGamesForPlayer(player_id: number): number {
        return Object.keys(this.connected_games).filter((game_id) => {
            const state = this.connected_games[game_id]?.state;
            if (state?.player_pool !== undefined) {
                return !!state.player_pool[player_id];
            }
            return state?.white_player_id === player_id || state?.black_player_id === player_id;
        }).length;
    }

    private ignorable_notifications = {
        delete: true,
        gameStarted: true,
        gameEnded: true,
        gameDeclined: true,
        gameResumedFromStoneRemoval: true,
        tournamentStarted: true,
        tournamentEnded: true,
        aiReviewDone: true,
    };

    /** Delete a notification from the server */
    private deleteNotification(notification: any) {
        this.socket.send("notification/delete", { notification_id: notification.id }, () => {
            trace.trace("Deleted notification ", notification.id);
        });
    }

    /** Handle incoming notifications */
    private handleNotification(notification: any): void {
        switch (notification.type) {
            case "friendRequest":
                {
                    trace.log("Friend request from ", notification.user.username);
                    post(
                        api1("me/friends/invitations"),
                        { from_user: notification.user.id },
                        {
                            server: this.config.server,
                            apikey: this.config.apikey,
                            bot_id: this.bot_id,
                        },
                    )
                        .then((obj) => trace.info(obj.body))
                        .catch((err) => trace.error("Error accepting friend request:", err));
                }
                break;

            case "challenge":
                {
                    if (!this.challenge_validator) {
                        trace.warn("No challenge validator configured, rejecting challenge");
                        this.rejectChallenge(
                            notification.challenge_id,
                            "Bot is not properly configured to accept challenges.",
                        );
                        break;
                    }

                    const reject: RejectionDetails | undefined =
                        this.challenge_validator.validateChallenge(notification);

                    if (!reject) {
                        // Accept the challenge
                        post(
                            api1(`me/challenges/${notification.challenge_id}/accept`),
                            {},
                            {
                                server: this.config.server,
                                apikey: this.config.apikey,
                                bot_id: this.bot_id,
                            },
                        )
                            .then(() => {
                                trace.info(
                                    `Accepted challenge from ${notification.user.username} (ID: ${notification.challenge_id})`,
                                );
                            })
                            .catch(() => {
                                trace.error("Error accepting challenge, declining it");
                                this.rejectChallenge(
                                    notification.challenge_id,
                                    "Error accepting game challenge, challenge has been removed.",
                                );
                                this.deleteNotification(notification);
                            });
                    } else {
                        // Reject the challenge
                        trace.info(
                            `Rejecting challenge from ${notification.user.username} (ID: ${notification.user.id})`,
                            reject,
                        );
                        post(
                            api1(`me/challenges/${notification.challenge_id}`),
                            {
                                delete: true,
                                message: reject.message,
                                rejection_details: reject,
                            },
                            {
                                server: this.config.server,
                                apikey: this.config.apikey,
                                bot_id: this.bot_id,
                            },
                        )
                            .then(() => {
                                trace.info(`Rejected challenge ${notification.challenge_id}`);
                            })
                            .catch((err) => trace.error("Error rejecting challenge:", err));
                    }
                }
                break;

            default:
                {
                    if (!(notification.type in this.ignorable_notifications)) {
                        trace.log("Unhandled notification type: ", notification.type, notification);
                    }
                    if (notification.type !== "delete") {
                        this.deleteNotification(notification);
                    }
                }
                break;
        }
    }

    /** Reject a challenge with a message */
    private rejectChallenge(challenge_id: number, message: string) {
        post(
            api1(`me/challenges/${challenge_id}`),
            {
                delete: true,
                message: message,
            },
            {
                server: this.config.server,
                apikey: this.config.apikey,
                bot_id: this.bot_id,
            },
        )
            .then(() => {
                trace.info(`Rejected challenge ${challenge_id}`);
            })
            .catch((err) => trace.error("Error rejecting challenge:", err));
    }
}
