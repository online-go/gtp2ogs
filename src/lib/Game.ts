import { GobanEngine, GobanEngineConfig, GobanSocket, decodeMoves } from "goban-engine";
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

const MOVE_RETRY_DELAY_MS = 30_000;
const REJECTED_MOVE_RETRY_DELAY_MS = 2_000;

/** Manages a single game connection */
export class Game extends EventEmitter<Events> {
    game_id: number;
    state: GobanEngineConfig;
    bot?: BotInterface;
    disconnect_timeout: ReturnType<typeof setTimeout>;
    my_color: null | string;
    protected socket: GobanSocket;
    private bot_id: number;
    private processing: boolean;
    private game_started: boolean;
    private disconnected: boolean;
    /** Counts changes to the position, so a reply computed for an old one can be dropped. */
    private position_version: number;
    /** The position the bot has already sent a move for. */
    private answered_version: number;
    private move_retry_timeout: ReturnType<typeof setTimeout> | undefined;

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
        this.disconnect_timeout = null;
        this.processing = false;
        this.game_started = false;
        this.disconnected = false;
        this.position_version = 0;
        this.answered_version = -1;
        this.move_retry_timeout = undefined;

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
            this.position_version++;
            this.emit("gamedata", gamedata);

            // Determine bot color
            this.my_color = this.bot_id === this.state.players.black.id ? "black" : "white";
            this.log(`Gamedata received, playing as ${this.my_color}`);

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

            this.tryToMove();
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

            this.position_version++;
            this.emit("phase", phase);

            // The server sends no gamedata when stone removal is rejected and play resumes.
            this.tryToMove();
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

            const expected_move_number = this.state.moves.length + 1;

            // Verify move number is correct (should be handled by undo_accepted event)
            if (move.move_number !== expected_move_number) {
                trace.error(
                    `Received move for ${this.game_id} but move_number is invalid. ${
                        move.move_number
                    } !== ${expected_move_number}. Undo event may not have been processed correctly.`,
                );
                return;
            }

            this.state.moves.push(move.move as any);
            this.position_version++;
            this.emit("move", move);

            const m = decodeMoves(move.move, this.state.width, this.state.height)[0];
            this.log(
                `Move ${move.move_number}: ${move2gtpvertex(m, this.state.width, this.state.height)}`,
            );

            this.tryToMove();
        };

        this.socket.on(`game/${this.game_id}/move`, on_move);
        this.on("disconnecting", () => {
            this.socket.off(`game/${this.game_id}/move`, on_move);
        });

        // Handle undo events
        const on_undo_accepted = (data: any) => {
            if (!this.state) {
                return;
            }

            // Extract undo information
            let undo_move_count = 1;
            let move_number_before_undo = this.state.moves.length;

            if (typeof data === "object") {
                if (data.undo_move_count) {
                    undo_move_count = data.undo_move_count;
                }
                if (data.move_number) {
                    move_number_before_undo = data.move_number;
                }
            }

            const expected_length_after = move_number_before_undo - undo_move_count;

            // Remove moves to match expected state
            while (this.state.moves.length > expected_length_after) {
                this.state.moves.pop();
            }

            this.position_version++;
            this.log(`Undo accepted: now at move ${this.state.moves.length}`);

            this.tryToMove();
        };

        this.socket.on(`game/${this.game_id}/undo_accepted`, on_undo_accepted);
        this.on("disconnecting", () => {
            this.socket.off(`game/${this.game_id}/undo_accepted`, on_undo_accepted);
        });

        // The server sends this when it refuses a move.
        const on_error = (message: unknown) => {
            this.error("Server rejected the move:", message);
            this.answered_version = -1;
            this.scheduleMoveRetry(REJECTED_MOVE_RETRY_DELAY_MS);
        };

        (this.socket as any).on(`game/${this.game_id}/error`, on_error);
        this.on("disconnecting", () => {
            (this.socket as any).off(`game/${this.game_id}/error`, on_error);
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
        // If the bot supports setGame, provide a reference to this game
        if (bot.setGame) {
            bot.setGame(this);
        }
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

        // Send to server
        this.socket.send("game/move", {
            game_id: this.game_id,
            move: encodeMove(move),
        });
    }

    /** Whether the bot should choose a move for the current position. */
    private shouldMove(): boolean {
        return (
            !this.disconnected &&
            this.state?.phase === "play" &&
            this.answered_version !== this.position_version &&
            this.isMyTurn()
        );
    }

    /** The engine knows the turn order of handicap placement and preset positions. */
    private isMyTurn(): boolean {
        const moves = [...this.state.moves] as any;
        const engine = new GobanEngine({ ...this.state, moves }, undefined, true);
        return engine.colorToMove() === this.my_color;
    }

    private tryToMove() {
        this.makeMove().catch((error) => {
            this.error("Error making move:", error);
        });
    }

    /** Make a move using the attached bot */
    private async makeMove(): Promise<void> {
        if (!this.bot) {
            this.error("makeMove called but no bot is attached");
            return;
        }

        if (this.processing || !this.shouldMove()) {
            return;
        }

        clearTimeout(this.move_retry_timeout);
        this.processing = true;
        const version = this.position_version;

        try {
            this.log(`Requesting move from bot (${this.my_color} to play)`);
            const move = await this.bot.genmove(this.state, this.my_color as "black" | "white");
            if (version === this.position_version && !this.disconnected) {
                const move_text =
                    move.text || move2gtpvertex(move, this.state.width, this.state.height);
                this.log(`Bot returned move: ${move_text}`);
                this.answered_version = version;
                this.sendMove(move);
            } else {
                this.log("Dropping the bot's move because the position changed");
            }
        } catch (error) {
            this.error("Error getting move from bot:", error);
            this.scheduleMoveRetry(MOVE_RETRY_DELAY_MS);
        } finally {
            this.processing = false;
        }

        // Events that arrived during the query did not start a new one.
        if (version !== this.position_version) {
            this.tryToMove();
        }
    }

    /** Try again later, so a temporary failure doesn't lose the game on time. */
    private scheduleMoveRetry(delay_ms: number) {
        clearTimeout(this.move_retry_timeout);
        this.move_retry_timeout = setTimeout(() => this.tryToMove(), delay_ms);
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
        this.disconnected = true;
        this.emit("disconnecting");
        clearTimeout(this.move_retry_timeout);

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
