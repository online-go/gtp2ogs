import { decodeMoves } from "goban/src/GoMath";
import { move2gtpvertex } from "./util";

import { Move } from "./types";
import { Bot } from "./Bot";
import { trace } from "./trace";
import { socket } from "./socket";
import { config } from "./config";
import { EventEmitter } from "eventemitter3";
import { PvOutputParser } from "./PvOutputParser";

interface Events {
    disconnected: (game_id: number) => void;
}

/** This manages a single game */
export class Game extends EventEmitter<Events> {
    static moves_processing: any;
    static corr_moves_processing: any;

    connect_timeout: ReturnType<typeof setTimeout>;

    game_id: number;
    state: any;
    opponent_evenodd: null | number;
    greeted: boolean;
    bot?: Bot;
    resign_bot?: Bot;
    bot_failures: number;
    resign_bot_failures: number;
    my_color: null | string;
    corr_move_pending: boolean;
    processing: boolean;
    handicap_moves: Move[];
    disconnect_timeout: ReturnType<typeof setTimeout>;

    constructor(game_id) {
        super();

        this.state = null;
        this.opponent_evenodd = null;
        this.greeted = false;
        this.bot = undefined;
        this.resign_bot = undefined;
        this.bot_failures = 0;
        this.my_color = null;
        this.corr_move_pending = false;
        this.processing = false;
        this.handicap_moves = []; // Handicap stones waiting to be sent when bot is playing black.
        this.disconnect_timeout = null;

        this.log("Connecting to game.");

        // TODO: Command line options to allow undo?
        //
        socket.on(`game/${game_id}/undo_requested`, (undodata) => {
            this.log("Undo requested", JSON.stringify(undodata, null, 4));
        });

        socket.on(`game/${game_id}/gamedata`, (gamedata) => {
            if (!socket.connected) {
                return;
            }

            // Server has an issue that gamedata.clock.now will exist inconsistently. This will cause
            // false positives for gamedata changes. We never use the field, so just remove it.
            delete gamedata.clock.now;
            // auto_score also sometimes inconsistent. We don't use it, so ignore it to avoid pointless
            // restart.
            delete gamedata.auto_score;

            // Only call game over handler if game really just finished.
            // For some reason we get connected to already finished games once in a while ...
            if (gamedata.phase === "finished") {
                if (this.state && gamedata.phase !== this.state.phase) {
                    this.state = gamedata;
                    void this.gameOver();
                }
                return; // ignore -- it's either handled by gameOver or we already handled it before.
            }

            const gamedataChanged = this.state
                ? JSON.stringify(this.state) !== JSON.stringify(gamedata)
                : false;
            // If the gamedata is idential to current state, it's a duplicate. Ignore it and do nothing, unless
            // bot is not running.
            //
            if (this.state && !gamedataChanged && this.bot && !this.bot.dead) {
                this.log("Ignoring gamedata that matches current state");
                return;
            }

            // If server has issues it might send us a new gamedata packet and not a move event. We could try to
            // check if we're missing a move and send it to bot out of gamedata. For now as a safe fallback just
            // restart the bot by killing it here if another gamedata comes in. There normally should only be one
            // before we process any moves, and makeMove() is where a new Bot is created.
            //
            if (this.bot && gamedataChanged) {
                this.log("Killing bot because of gamedata change after bot was started");
                if (config.DEBUG) {
                    this.log("Previously seen gamedata:", this.state);
                    this.log("New gamedata:", gamedata);
                }
                this.ensureBotKilled();

                if (this.processing) {
                    this.processing = false;
                    --Game.moves_processing;
                    if (config.corrqueue && this.state.time_control.speed === "correspondence") {
                        --Game.corr_moves_processing;
                    }
                }
            }

            //this.log("Gamedata:", JSON.stringify(gamedata, null, 4));
            this.state = gamedata;
            this.my_color = config.bot_id === this.state.players.black.id ? "black" : "white";
            this.log(`gamedata     ${this.header()}`);

            // First handicap is just lower komi, more handicaps may change who is even or odd move #s.
            //
            if (this.state.free_handicap_placement && this.state.handicap > 1) {
                //In Chinese, black makes multiple free moves.
                //
                this.opponent_evenodd = this.my_color === "black" ? 0 : 1;
                this.opponent_evenodd = (this.opponent_evenodd + this.state.handicap - 1) % 2;
            } else if (this.state.handicap > 1) {
                // In Japanese, white makes the first move.
                //
                this.opponent_evenodd = this.my_color === "black" ? 1 : 0;
            } else {
                // If the game has a handicap, it can't be a fork and the above code works fine.
                // If the game has no handicap, it's either a normal game or a fork. Forks may have reversed turn ordering.
                //
                if (this.state.clock.current_player === config.bot_id) {
                    this.opponent_evenodd = this.state.moves.length % 2;
                } else {
                    this.opponent_evenodd = (this.state.moves.length + 1) % 2;
                }
            }

            // active_game isn't handling this for us any more. If it is our move, call makeMove.
            //
            if (this.state.phase === "play" && this.state.clock.current_player === config.bot_id) {
                if (
                    config.corrqueue &&
                    this.state.time_control.speed === "correspondence" &&
                    Game.corr_moves_processing > 0
                ) {
                    this.corr_move_pending = true;
                } else {
                    if (!this.bot || !this.processing) {
                        void this.makeMove(this.state.moves.length);
                    }
                }
            }
        });

        socket.on(`game/${game_id}/clock`, (clock) => {
            if (!socket.connected) {
                return;
            }

            // Server has an issue that gamedata.clock.now will exist inconsistently. This will cause
            // false positives for gamedata changes. We never use the field, so just remove it.
            delete clock.now;

            if (config.DEBUG) {
                this.log("clock:", JSON.stringify(clock));
            }

            if (
                (config.nopause && !config.nopauseranked && !config.nopauseunranked) ||
                (config.nopauseranked && this.state.ranked) ||
                (config.nopauseunranked && !this.state.ranked)
            ) {
                if (
                    clock.pause &&
                    clock.pause.paused &&
                    clock.pause.pause_control &&
                    !clock.pause.pause_control["stone-removal"] &&
                    !clock.pause.pause_control.system &&
                    !clock.pause.pause_control.weekend &&
                    !clock.pause.pause_control[`vacation-${clock.black_player_id}`] &&
                    !clock.pause.pause_control[`vacation-${clock.white_player_id}`]
                ) {
                    const forRankedUnranked = getForRankedUnranked(this.state.ranked);
                    const noPauseMg = `Pausing not allowed ${forRankedUnranked}. Resuming game.`;
                    this.sendChat(noPauseMg);
                    if (config.DEBUG) {
                        this.log(noPauseMg);
                    }
                    this.resumeGame();
                }
            }

            if (this.state) {
                this.state.clock = clock;
            } else {
                if (config.DEBUG) {
                    trace.error(`Received clock for ${this.game_id} but no state exists`);
                }
            }
        });
        socket.on(`game/${game_id}/phase`, (phase) => {
            if (!socket.connected) {
                return;
            }
            this.log("phase", phase);

            //this.log("Move: ", move);
            if (this.state) {
                this.state.phase = phase;
            } else {
                if (config.DEBUG) {
                    trace.error(`Received phase for ${this.game_id} but no state exists`);
                }
            }

            if (phase === "play") {
                this.scheduleRetry();
            }
        });
        socket.on(`game/${game_id}/move`, (move) => {
            if (!socket.connected) {
                return;
            }
            if (config.DEBUG) {
                this.log(`game/${game_id}/move:`, move);
            }
            if (!this.state) {
                trace.error(`Received move for ${this.game_id} but no state exists`);
                // Try to connect again, to get the server to send the gamedata over.
                socket.send("game/connect", {
                    game_id: game_id,
                });
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
            try {
                this.state.moves.push(move.move);

                // Log opponent moves
                const m = decodeMoves(move.move, this.state.width, this.state.height)[0];
                if (
                    (this.my_color === "white" && this.state.handicap >= this.state.moves.length) ||
                    move.move_number % 2 === this.opponent_evenodd
                ) {
                    this.log(`Got     ${move2gtpvertex(m, this.state.width, this.state.height)}`);
                }
            } catch (e) {
                trace.error(e);
            }

            // If we're in free placement handicap phase of the game, make extra moves or wait it out, as appropriate.
            //
            // If handicap === 1, no extra stones are played.
            // If we are black, we played after initial gamedata and so handicap is not < length.
            // If we are white, this.state.moves.length will be 1 and handicap is not < length.
            //
            // If handicap >= 1, we don't check for opponent_evenodd to move on our turns until handicaps are finished.
            //
            if (
                this.state.free_handicap_placement &&
                this.state.handicap > this.state.moves.length
            ) {
                if (this.my_color === "black") {
                    // If we are black, we make extra moves.
                    //
                    void this.makeMove(this.state.moves.length);
                } else {
                    // If we are white, we wait for opponent to make extra moves.
                    if (this.bot) {
                        void this.bot.sendMove(
                            decodeMoves(move.move, this.state.width, this.state.height)[0],
                            this.state.width,
                            this.state.height,
                            this.my_color === "black" ? "white" : "black",
                        );
                        void this.resign_bot.sendMove(
                            decodeMoves(move.move, this.state.width, this.state.height)[0],
                            this.state.width,
                            this.state.height,
                            this.my_color === "black" ? "white" : "black",
                        );
                    }
                    if (config.DEBUG) {
                        this.verbose(
                            "Waiting for opponent to finish",
                            this.state.handicap - this.state.moves.length,
                            "more handicap moves",
                        );
                    }
                    if (this.state.moves.length === 1) {
                        // remind once, avoid spamming the reminder
                        this.sendChat("Waiting for opponent to place all handicap stones"); // reminding human player in ingame chat
                    }
                }
            } else {
                if (move.move_number % 2 === this.opponent_evenodd) {
                    // We just got a move from the opponent, so we can move immediately.
                    //
                    if (this.bot) {
                        void this.bot.sendMove(
                            decodeMoves(move.move, this.state.width, this.state.height)[0],
                            this.state.width,
                            this.state.height,
                            this.my_color === "black" ? "white" : "black",
                        );
                        void this.resign_bot.sendMove(
                            decodeMoves(move.move, this.state.width, this.state.height)[0],
                            this.state.width,
                            this.state.height,
                            this.my_color === "black" ? "white" : "black",
                        );
                    }

                    if (
                        config.corrqueue &&
                        this.state.time_control.speed === "correspondence" &&
                        Game.corr_moves_processing > 0
                    ) {
                        this.corr_move_pending = true;
                    } else {
                        void this.makeMove(this.state.moves.length);
                    }
                    //this.makeMove(this.state.moves.length);
                } else {
                    if (config.DEBUG) {
                        this.log("Ignoring our own move", move.move_number);
                    }
                }
            }
        });

        socket.send("game/connect", {
            game_id: game_id,
        });

        this.connect_timeout = setTimeout(() => {
            if (!this.state) {
                this.log("No gamedata after 1s, reqesting again");
                this.scheduleRetry();
            }
        }, 1000);
    }

    // Kill the bot, if it is currently running.
    ensureBotKilled() {
        if (this.bot) {
            if (this.bot.failed) {
                this.bot_failures++;
                if (config.DEBUG) {
                    this.log(`Observed ${this.bot_failures} bot failures`);
                }
            }
            this.bot.kill();
            this.bot = undefined;
        }
        if (this.resign_bot) {
            if (this.resign_bot.failed) {
                this.resign_bot_failures++;
                if (config.DEBUG) {
                    this.log(`Observed ${this.resign_bot_failures} resign_bot failures`);
                }
            }
            this.resign_bot.kill();
            this.resign_bot = undefined;
        }
    }
    // Start the bot.
    async ensureBotStarted(): Promise<void> {
        if (this.bot && this.bot.dead) {
            this.ensureBotKilled();
        }

        if (this.bot) {
            return;
        }

        if (this.bot_failures >= 5) {
            // This bot keeps on failing, give up on the game.
            this.log("Bot has crashed too many times, resigning game");
            this.sendChat("Bot has crashed too many times, resigning game"); // we notify user of this in ingame chat
            socket.send("game/resign", {
                game_id: this.game_id,
            });
            throw new Error("Bot has crashed too many times, resigning game");
        }

        let pv_parser: PvOutputParser;
        if (config.send_pv) {
            pv_parser = new PvOutputParser(this);
        }

        this.bot = new Bot(config.bot_command, pv_parser);
        this.bot.log(`[game ${this.game_id}] Starting up bot: ${config.bot_command.join(" ")}`);
        this.bot.on("chat", (message, channel) =>
            this.sendChat(message, this.state.moves.length + 1, channel),
        );

        this.bot.log(`[game ${this.game_id}] Loading state`);
        await this.bot.loadState(this.state);
        if (config.DEBUG) {
            this.bot.log(`[game ${this.game_id}] State loaded successfully`);
        }

        if (config.resign_bot_command) {
            this.resign_bot = new Bot(
                config.resign_bot_command,
                undefined,
                true /* is resign bot */,
            );

            this.resign_bot.log(
                `[game ${this.game_id}] Starting up resign bot: ${config.resign_bot_command.join(
                    " ",
                )}`,
            );
            this.resign_bot.log(`[game ${this.game_id}] Loading state`);
            await this.resign_bot.loadState(this.state);
            if (config.DEBUG) {
                this.resign_bot.log(`[game ${this.game_id}] State loaded successfully`);
            }
        }
    }

    checkBotPersists() {
        if (config.persist) {
            return true;
        }
        if (config.persistnoncorr && this.state.time_control.speed !== "correspondence") {
            return true;
        }
        return false;
    }

    // Send @cmd to bot and call @cb with returned moves.
    //
    async getBotMoves(cmd): Promise<Move[]> {
        ++Game.moves_processing;
        this.processing = true;
        if (config.corrqueue && this.state.time_control.speed === "correspondence") {
            ++Game.corr_moves_processing;
        }

        const doneProcessing = () => {
            this.processing = false;
            --Game.moves_processing;
            if (config.corrqueue && this.state.time_control.speed === "correspondence") {
                this.corr_move_pending = false;
                --Game.corr_moves_processing;
            }
        };

        try {
            await this.ensureBotStarted();

            if (config.DEBUG) {
                this.bot.log("Generating move for game", this.game_id);
            }
            this.log(cmd);

            const [our_moves, resign_moves] = await Promise.all([
                this.bot.getMoves(cmd, this.state),
                this.resign_bot?.getMoves(cmd, this.state),
            ]);

            this.verbose(
                `Our moves: ${JSON.stringify(our_moves)}  Resign bot: ${JSON.stringify(
                    resign_moves,
                )}`,
            );

            const resign = resign_moves && resign_moves.length > 0 && resign_moves[0].resign;

            if (resign) {
                this.log("Our resign bot has indicated we should resign, so we are resigning");
            }

            doneProcessing();
            if (!this.checkBotPersists()) {
                this.ensureBotKilled();
            }

            return resign ? resign_moves : our_moves;
        } catch (e) {
            doneProcessing();
            this.ensureBotKilled();

            trace.error(e);
            this.log("Failed to start the bot, can not make a move, trying to restart");
            this.sendChat("Failed to start the bot, can not make a move, trying to restart"); // we notify user of this in ingame chat
            throw e;
        }
    }

    scheduleRetry(): void {
        if (config.DEBUG) {
            this.log(
                "Unable to react correctly - re-connect to trigger action based on game state.",
            );
        }
        socket.send("game/disconnect", {
            game_id: this.game_id,
        });
        socket.send("game/connect", {
            game_id: this.game_id,
        });
    }
    // Send move to server.
    //
    uploadMove(move: Move): void {
        if (move.resign) {
            this.log("Resigning");
            socket.send("game/resign", {
                game_id: this.game_id,
            });
            return;
        }

        if (config.DEBUG) {
            this.log(`Playing ${move.text}`, move);
        } else {
            this.log(`Playing ${move.text}`);
        }
        socket.send("game/move", {
            game_id: this.game_id,
            move: encodeMove(move),
        });
    }

    // Get move from bot and upload to server.
    // Handle handicap stones with bot as black transparently
    // (we get all of them at once with place_free_handicap).
    //
    async makeMove(move_number): Promise<void> {
        if (config.DEBUG && this.state) {
            this.log(
                "makeMove",
                move_number,
                "is",
                this.state.moves.length,
                "!==",
                move_number,
                "?",
            );
        }
        if (!this.state || this.state.moves.length !== move_number) {
            return;
        }
        if (this.state.phase !== "play") {
            return;
        }
        if (!this.greeted && this.state.moves.length < 2 + this.state.handicap) {
            this.greeted = true;
            if (config.greeting) {
                this.sendChat(config.greeting);
            }
            if (config.greetingbotcommand) {
                const pretty_bot_command = config.bot_command.join(" ");
                this.sendChat(`You are playing against: ${pretty_bot_command}`);
            }
        }

        const doing_handicap =
            this.state.free_handicap_placement &&
            this.state.handicap > 1 &&
            this.state.moves.length < this.state.handicap;

        if (!doing_handicap) {
            // Regular genmove ...
            const move_start = Date.now();
            try {
                const moves = await this.getBotMoves(`genmove ${this.my_color}`);
                const move_end = Date.now();
                const move_time = move_end - move_start;
                if (config.min_move_time && move_time < config.min_move_time) {
                    trace.info(
                        "Min move time was ",
                        config.min_move_time,
                        "ms and we only took ",
                        move_time,
                        "ms. Waiting ",
                        config.min_move_time - move_time,
                        "ms before sending move",
                    );
                    setTimeout(() => {
                        this.uploadMove(moves[0]);
                    }, config.min_move_time - move_time);
                } else {
                    this.uploadMove(moves[0]);
                }
            } catch (e) {
                this.scheduleRetry();
            }
            return;
        }

        // Already have handicap stones ? Return next one.
        if (this.handicap_moves.length) {
            this.uploadMove(this.handicap_moves.shift());
            return;
        }

        const warnAndResign = (msg) => {
            this.log(msg);
            this.ensureBotKilled();
            this.uploadMove({ resign: true });
        };

        // Get handicap stones from bot and return first one.

        try {
            const moves = await this.getBotMoves(`place_free_handicap ${this.state.handicap}`);
            if (moves.length !== this.state.handicap) {
                // Sanity check
                warnAndResign(
                    "place_free_handicap returned wrong number of handicap stones, resigning.",
                );
                return;
            }
            for (const i in moves) {
                // Sanity check
                if (moves[i].pass || moves[i].x < 0) {
                    warnAndResign("place_free_handicap returned a pass, resigning.");
                    return;
                }
            }
            this.handicap_moves = moves;
            this.uploadMove(this.handicap_moves.shift());
        } catch (e) {
            this.scheduleRetry();
        }
    }

    disconnect(): void {
        if (this.processing) {
            this.processing = false;
            --Game.moves_processing;
            if (config.corrqueue && this.state.time_control.speed === "correspondence") {
                --Game.corr_moves_processing;
            }
        }

        this.ensureBotKilled();

        this.log("Disconnecting from game.");
        socket.send("game/disconnect", {
            game_id: this.game_id,
        });
    }
    getRes(result): string {
        const m = this.state.outcome.match(/(.*) points/);
        if (m) {
            return m[1];
        }

        if (result === "Resignation") {
            return "R";
        }
        if (result === "Cancellation") {
            return "Can";
        }
        if (result === "Timeout") {
            return "Time";
        }
    }
    async gameOver(): Promise<void> {
        if (config.farewell && this.state) {
            this.sendChat(config.farewell);
        }

        // Display result
        const col = this.state.winner === this.state.players.black.id ? "B" : "W";
        const result = `${this.state.outcome[0].toUpperCase()}${this.state.outcome.substr(1)}`;
        const res = this.getRes(result);
        const winloss = this.state.winner === config.bot_id ? "W" : "L";
        this.log(`Game over.   Result: ${col}+${res}  ${winloss}`);

        // Notify bot of end of game and send score
        if (config.farewellscore && this.bot) {
            const score = await this.bot.command("final_score", true); // allow bot to process end of game
            if (score) {
                this.log(`Bot thinks the score was ${score}`);
            }
            if (res !== "R" && res !== "Time" && res !== "Can") {
                this.sendChat(`Final score was ${score} according to the bot.`);
            }
            if (this.bot) {
                // only kill the bot after it processed this
                this.bot.gameOver();
                this.resign_bot?.gameOver();
                this.ensureBotKilled();
            }
        } else if (this.bot) {
            this.bot.gameOver();
            this.resign_bot?.gameOver();
            this.ensureBotKilled();
        }

        if (!this.disconnect_timeout) {
            if (config.DEBUG) {
                trace.log(`Starting disconnect Timeout in Game ${this.game_id} gameOver()`);
            }
            this.disconnect_timeout = setTimeout(() => {
                this.emit("disconnected", this.game_id);
            }, 1000);
        }
    }
    header(): string {
        if (!this.state) {
            return;
        }
        const botIsBlack = this.state.players.black.username === config.username;
        const color = botIsBlack ? "  B" : "W  "; // Playing black / white against ...
        const player = botIsBlack ? this.state.players.white : this.state.players.black;
        const handi = this.state && this.state.handicap ? `H${this.state.handicap}` : "  ";
        return `${color} ${player.username}  [${this.state.width}x${this.state.height}]  ${handi}`;

        // XXX doesn't work, getting garbage ranks here ...
        // const rank = rankToString(player.rank);
    }
    log(...args: any[]): void {
        const moves = this.state && this.state.moves ? this.state.moves.length : 0;
        const movestr = moves ? `Move ${moves}` : "        ";
        const arr = [`[Game ${this.game_id}]  ${movestr} `];

        for (let i = 0; i < args.length; ++i) {
            arr.push(args[i]);
        }
        trace.log.apply(null, arr);
    }
    verbose(...args: any[]): void {
        if (!config.DEBUG) {
            return;
        }
        const moves = this.state && this.state.moves ? this.state.moves.length : 0;
        const movestr = moves ? `Move ${moves}` : "        ";
        const arr = [`[Game ${this.game_id}]  ${movestr} `];

        for (let i = 0; i < args.length; ++i) {
            arr.push(args[i]);
        }
        trace.log.apply(null, arr);
    }
    sendChat(str: string, move_number?: number, channel: "main" | "malkovich" = "main"): void {
        if (!socket.connected) {
            return;
        }

        socket.send("game/chat", {
            game_id: this.game_id,
            body: str,
            move_number: move_number,
            type: channel,
        });
    }
    resumeGame(): void {
        socket.send("game/resume", {
            game_id: this.game_id,
        });
    }
    getOpponent() {
        const player =
            this.state.players.white.id === config.bot_id
                ? this.state.players.black
                : this.state.players.white;
        return player;
    }
}

function num2char(num: number): string {
    if (num === -1) {
        return ".";
    }
    return "abcdefghijklmnopqrstuvwxyz"[num];
}
function encodeMove(move: Move): string {
    if (move["x"] === -1) {
        return "..";
    }
    return num2char(move["x"]) + num2char(move["y"]);
}
function getForRankedUnranked(rankedStatus: boolean): string {
    if (rankedStatus) {
        return "for ranked games";
    }
    return "for unranked games";
}

Game.moves_processing = 0;
Game.corr_moves_processing = 0;
