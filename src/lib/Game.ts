import { GobanEngineConfig, GobanSocket, decodeMoves } from "goban-engine";
import { EventEmitter } from "eventemitter3";
import { trace } from "./trace";
import { BotInterface } from "./types";
import { move2gtpvertex, encodeMove } from "./util";
import { Move } from "../types";

interface Events {
    disconnecting: () => void;
    disconnected: (game_id: number) => void;
    move: (move: any) => void;
    phase: (phase: string) => void;
    gamedata: (gamedata: GobanEngineConfig) => void;
}

/** Manages a single game connection */
export class Game extends EventEmitter<Events> {
    game_id: number;
    state: GobanEngineConfig;
    bot?: BotInterface;
    disconnect_timeout: ReturnType<typeof setTimeout>;
    my_color: null | string;
    protected socket: GobanSocket;
    private bot_id: number;
    private opponent_evenodd: null | number;
    private processing: boolean;
    private game_started: boolean;

    log: (...arr: any[]) => any;
    trace: (...arr: any[]) => any;
    verbose: (...arr: any[]) => any;
    warn: (...arr: any[]) => any;
    error: (...arr: any[]) => any;

    constructor(game_id: number, socket: GobanSocket, bot_id: number) {
        super();

        if (!game_id) {
            throw new Error(`Invalid game id: ${game_id}`);
        }

        this.game_id = game_id;
        this.socket = socket;
        this.bot_id = bot_id;
        this.log = trace.log.bind(null, `[game ${game_id}]`);
        this.trace = trace.trace.bind(null, `[game ${game_id}]`);
        this.verbose = trace.debug.bind(null, `[game ${game_id}]`);
        this.warn = trace.warn.bind(null, `[game ${game_id}]`);
        this.error = trace.error.bind(null, `[game ${game_id}]`);
        this.state = null;
        this.my_color = null;
        this.opponent_evenodd = null;
        this.disconnect_timeout = null;
        this.processing = false;
        this.game_started = false;

        this.log("Connecting to game.");
        this.setupSocketHandlers();
        this.connectToGame();
    }

    private setupSocketHandlers() {
        const on_gamedata = (gamedata) => {
            if (!this.socket.connected) {
                return;
            }

            // Server has an issue that gamedata.clock.now will exist inconsistently
            delete gamedata.clock.now;
            delete (gamedata as any).auto_score;

            if (gamedata.phase === "finished") {
                if (this.state && gamedata.phase !== this.state.phase) {
                    this.state = gamedata;
                    this.handleGameOver();
                }
                return;
            }

            this.state = gamedata;
            this.emit("gamedata", gamedata);

            // Determine bot color
            this.my_color = this.bot_id === this.state.players.black.id ? "black" : "white";
            this.log(`Gamedata received, playing as ${this.my_color}`);

            // Determine opponent evenodd for tracking whose turn it is
            if (this.state.free_handicap_placement && this.state.handicap > 1) {
                // In Chinese rules, black makes multiple free moves
                this.opponent_evenodd = this.my_color === "black" ? 0 : 1;
                this.opponent_evenodd = (this.opponent_evenodd + this.state.handicap - 1) % 2;
            } else if (this.state.handicap > 1) {
                // In Japanese rules, white makes the first move
                this.opponent_evenodd = this.my_color === "black" ? 0 : 1;
            } else {
                // No handicap, alternate turns normally
                if (this.state.clock.current_player === this.bot_id) {
                    this.opponent_evenodd = this.state.moves.length % 2;
                } else {
                    this.opponent_evenodd = (this.state.moves.length + 1) % 2;
                }
            }

            // Call bot.gameStarted() on first gamedata
            if (!this.game_started && this.bot && this.bot.gameStarted) {
                this.game_started = true;
                this.bot
                    .gameStarted(this.state)
                    .then(() => {
                        this.log("Bot gameStarted");
                    })
                    .catch((error) => {
                        this.error("Bot gameStarted error", error);
                    });
            }

            // If it's our turn to move, make a move
            if (this.state.phase === "play" && this.state.clock.current_player === this.bot_id) {
                if (!this.processing) {
                    this.makeMove().catch((error) => {
                        this.error("Error making move:", error);
                    });
                }
            }
        };

        this.socket.on(`game/${this.game_id}/gamedata`, on_gamedata);
        this.on("disconnecting", () => {
            this.socket.off(`game/${this.game_id}/gamedata`, on_gamedata);
        });

        const on_clock = (clock) => {
            if (!this.socket.connected) {
                return;
            }

            delete clock.now;

            if (this.state) {
                this.state.clock = clock;
            } else {
                this.error(`Received clock for ${this.game_id} but no state exists`);
            }
        };

        this.socket.on(`game/${this.game_id}/clock`, on_clock);
        this.on("disconnecting", () => {
            this.socket.off(`game/${this.game_id}/clock`, on_clock);
        });

        const on_phase = (phase) => {
            if (!this.socket.connected) {
                return;
            }
            this.log("phase", phase);

            if (this.state) {
                this.state.phase = phase;
            } else {
                trace.error(`Received phase for ${this.game_id} but no state exists`);
            }

            this.emit("phase", phase);
        };

        this.socket.on(`game/${this.game_id}/phase`, on_phase);
        this.on("disconnecting", () => {
            this.socket.off(`game/${this.game_id}/phase`, on_phase);
        });

        const on_move = (move) => {
            if (!this.socket.connected) {
                return;
            }
            this.trace(`game/${this.game_id}/move:`, move);

            if (!this.state) {
                trace.error(`Received move for ${this.game_id} but no state exists`);
                return;
            }

            if (move.move_number !== this.state.moves.length + 1) {
                trace.error(
                    `Received move for ${this.game_id} but move_number is invalid. ${
                        move.move_number
                    } !== ${this.state.moves.length + 1}`,
                );
                return;
            }

            this.state.moves.push(move.move as any);
            this.emit("move", move);

            const m = decodeMoves(move.move, this.state.width, this.state.height)[0];

            // Check if this is an opponent move
            if (move.move_number % 2 === this.opponent_evenodd) {
                this.log(`Opponent played ${move2gtpvertex(m.x, m.y, this.state.height)}`);

                // It's our turn to move now
                if (!this.processing) {
                    this.makeMove().catch((error) => {
                        this.error("Error making move:", error);
                    });
                }
            }
        };

        this.socket.on(`game/${this.game_id}/move`, on_move);
        this.on("disconnecting", () => {
            this.socket.off(`game/${this.game_id}/move`, on_move);
        });
    }

    private connectToGame() {
        this.socket.send("game/connect", {
            game_id: this.game_id,
            chat: false,
        });
    }

    /** Attach a bot to this game */
    attachBot(bot: BotInterface) {
        this.bot = bot;
    }

    /** Send a move to the server */
    sendMove(move: Move) {
        // Handle resignation
        if (move.resign) {
            this.log("Resigning");
            this.socket.send("game/resign", {
                game_id: this.game_id,
            });
            return;
        }

        // Log the move
        const move_text = move.text || move2gtpvertex(move, this.state.width, this.state.height);
        this.log(`Playing ${move_text}`);

        // Send to server
        this.socket.send("game/move", {
            game_id: this.game_id,
            move: encodeMove(move),
        });
    }

    /** Make a move using the attached bot */
    private async makeMove(): Promise<void> {
        if (!this.bot) {
            this.error("makeMove called but no bot is attached");
            return;
        }

        if (!this.state || this.state.phase !== "play") {
            return;
        }

        if (this.processing) {
            return;
        }

        this.processing = true;

        try {
            this.log(`Requesting move from bot (${this.my_color} to play)`);
            const move = await this.bot.genmove(this.state, this.my_color as "black" | "white");
            const move_text = move.text || move2gtpvertex(move, this.state.width, this.state.height);
            this.log(`Bot returned move: ${move_text}`);

            // Send the move to the server
            this.sendMove(move);
        } catch (error) {
            this.error("Error getting move from bot:", error);
        } finally {
            this.processing = false;
        }
    }

    /** Send a chat message */
    sendChat(message: string, channel: "main" | "malkovich" = "main") {
        this.socket.send("game/chat", {
            game_id: this.game_id,
            body: message,
            move_number: this.state?.moves?.length || 0,
            type: channel === "main" ? "main" : "malkovich",
        });
    }

    private handleGameOver() {
        this.log("Game is over");
        if (this.bot && this.bot.gameEnded) {
            this.bot
                .gameEnded({
                    winner: String(this.state.winner || ""),
                    outcome: this.state.outcome,
                })
                .then(() => {
                    this.log("Bot gameEnded");
                })
                .catch((error) => {
                    this.error("Bot gameEnded error", error);
                });
        }
    }

    /** Disconnect from the game */
    disconnect() {
        this.log("Disconnecting from game");
        this.emit("disconnecting");

        if (this.disconnect_timeout) {
            clearTimeout(this.disconnect_timeout);
            this.disconnect_timeout = null;
        }

        this.socket.send("game/disconnect", {
            game_id: this.game_id,
        });

        this.emit("disconnected", this.game_id);
    }
}
