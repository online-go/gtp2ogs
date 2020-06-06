// vim: tw=120 softtabstop=4 shiftwidth=4

const split2 = require('split2');

const { decodeMoves } = require("./utils/decodeMoves");
const { gtpchar2num } = require("./utils/gtpchar2num");
const { move2gtpvertex } = require("./utils/move2gtpvertex");

const child_process = require('child_process');
const console = require('./console').console;
const config = require('./config');
const { Pv } = require('./pv');

/*********/
/** Bot **/
/*********/
class Bot {
    constructor(conn, game, cmd) {
        this.conn = conn;
        this.game = game;
        this.commands_sent = 0;
        this.command_callbacks = [];
        this.command_error_callbacks = [];
        this.firstmove = true;
        this.ignore = false;   // Ignore output from bot ?
        // Set to true when the bot process has died and needs to be restarted before it can be used again.
        this.dead = false;
        // Set to true when there is a command failure or a bot failure and the game fail counter should be incremented.
        // After a few failures we stop retrying and resign the game.
        this.failed = false;
        if (config.ogspv) this.pv = new Pv(config.ogspv, game);

        if (config.DEBUG) this.log("Starting ", cmd.join(' '));
        try {
            this.proc = child_process.spawn(cmd[0], cmd.slice(1));
        } catch (e) {
            this.log("Failed to start the bot: ", e);
            this.ignore = true;
            this.dead = true;
            this.failed = true;
            return;
        }

        this.proc.stderr.pipe(split2()).on('data', (data) => {
            if (this.ignore)  return;
            const errline = data.toString().trim();
            if (errline === "") return;
            this.error(`stderr: ${errline}`);

            if (config.ogspv) this.pv.postPvToChat(errline);
            if (config.aichat) {
                const chat_match = /(DISCUSSION|MALKOVICH):(.*)/.exec(errline)
                if (chat_match) {
                    this.game.sendChat(chat_match[2], this.game.state.moves.length + 1, chat_match[1].toLowerCase())
                }
            }
        });

        let stdout_buffer = "";
        this.proc.stdout.on('data', (data) => {
            if (this.ignore)  return;
            stdout_buffer += data.toString();

            if (config.json) {
                try {
                    stdout_buffer = JSON.parse(stdout_buffer);
                } catch (e) {
                    // Partial result received, wait until we can parse the result
                    return;
                }
            }

            if (!stdout_buffer || stdout_buffer[stdout_buffer.length-1] !== '\n') {
                //this.log("Partial result received, buffering until the output ends with a newline");
                return;
            }
            if (config.DEBUG) {
                this.log("<<<", stdout_buffer.trim());
            }

            const lines = stdout_buffer.split("\n");
            stdout_buffer = "";
            for (let i = 0; i < lines.length; ++i) {
                const line = lines[i];
                if (line.trim() === "") {
                    continue;
                }
                if (line[0] === '=') {
                    while (lines[i].trim() !== "") {
                        ++i;
                    }
                    const cb = this.command_callbacks.shift();
                    this.command_error_callbacks.shift();
                    if (cb) cb(line.substr(1).trim());
                }
                else if (line.trim()[0] === '?') {
                    this.log(line);
                    while (lines[i].trim() !== "") {
                        ++i;
                        this.log(lines[i]);
                    }
                    this.failed = true;
                    this.command_callbacks.shift();
                    const eb = this.command_error_callbacks.shift();
                    if (eb) eb(line.substr(1).trim());
                }
                else {
                    this.log("Unexpected output: ", line);
                    this.failed = true;
                    this.command_callbacks.shift();
                    const eb = this.command_error_callbacks.shift();
                    if (eb) eb();
                    //throw new Error(`Unexpected output: ${line}`);
                }
            }
        });
        this.proc.on('exit', (code) => {
            if (config.DEBUG) {
                this.log('Bot exited');
            }
            this.command_callbacks.shift();
            this.dead = true;
            const eb = this.command_error_callbacks.shift();
            if (eb) eb(code);
        });
        this.proc.stdin.on('error', (code) => {
            if (config.DEBUG) {
                this.log('Bot stdin write error');
            }
            this.command_callbacks.shift();
            this.dead = true;
            this.failed = true;
            const eb = this.command_error_callbacks.shift();
            if (eb) eb(code);
        });
    }
    pid() {
        if (this.proc) {
            return this.proc.pid;
        } else {
            return -1;
        }
    }
    log() {
        const arr = [ `[${this.pid()}]` ];
        for (let i = 0; i < arguments.length; ++i) {
            arr.push(arguments[i]);
        }

        console.log.apply(null, arr);
    }
    error() {
        const arr = [ `[${this.pid()}]` ];
        for (let i = 0; i < arguments.length; ++i) {
            arr.push(arguments[i]);
        }

        console.error.apply(null, arr);
    }
    verbose() {
        const arr = [ `[${this.pid()}]` ];
        for (let i = 0; i < arguments.length; ++i) {
            arr.push(arguments[i]);
        }

        console.verbose.apply(null, arr);
    }
    loadClock(state) {
        /* References:
           http://www.lysator.liu.se/~gunnar/gtp/gtp2-spec-draft2/gtp2-spec.html#sec:time-handling
           http://www.weddslist.com/kgs/how/kgsGtp.html

           GTP v2 only supports Canadian byoyomi, no timer (see spec above), 
           and absolute (period time zero).
          
           kgs-time_settings adds support for Japanese byoyomi.
          
           TODO: Use known_commands to check for kgs-time_settings support automatically.
          
           The kgsGtp interface (http://www.weddslist.com/kgs/how/kgsGtp.html)
           converts byoyomi to absolute time for bots that don't support 
           kgs-time_settings by using main_time plus periods * period_time.
           But then the bot would view that as the total time left for entire rest of game...
          
           Japanese byoyomi with one period left could be viewed as a special case 
           of Canadian byoyomi where the number of stones is always = 1
        */  
        if (config.noclock) return;

        //let now = state.clock.now ? state.clock.now : (Date.now() - this.conn.clock_drift);
        let now = Date.now() - this.conn.clock_drift;

        let black_offset = 0;
        let white_offset = 0;

        if (state.clock.current_player === state.clock.black_player_id) {
            black_offset = ((this.firstmove===true ? config.startupbuffer : 0) + now - state.clock.last_move) / 1000;
        } else {
            white_offset = ((this.firstmove===true ? config.startupbuffer : 0) + now - state.clock.last_move) / 1000;
        }

        if (state.time_control.system === 'byoyomi') {
            /* GTP spec says time_left should have 0 for stones until main_time has run out.

               If the bot connects in the middle of a byoyomi period, it won't know
               how much time it has left before the period expires.
               When restarting the bot mid-match during testing, it sometimes lost 
               on timeout because of this. 
               To work around it, we can reduce the byoyomi period size by the offset.
               Not strictly accurate but GTP protocol provides nothing better.
               Once bot moves again, the next state setup should have this corrected.
               This problem would happen if a bot were to crash and re-start during a period.
               This is only an issue if it is our turn, and our main time left is 0.
            */
            if (config.kgstime) {
                let black_timeleft = 0;
                let white_timeleft = 0;

                if (state.clock.black_time.thinking_time > 0) {
                    black_timeleft = Math.max( Math.floor(state.clock.black_time.thinking_time - black_offset), 0);
                } else {
                    black_timeleft = Math.max( Math.floor(state.time_control.period_time - black_offset), 0);
                }

                if (state.clock.white_time.thinking_time > 0) {
                    white_timeleft = Math.max( Math.floor(state.clock.white_time.thinking_time - white_offset), 0);
                } else {
                    white_timeleft = Math.max( Math.floor(state.time_control.period_time - white_offset), 0);
                }

                /* Restarting the bot can make a time left so small the bot makes a 
                   rushed terrible move.
                   If we have less than half a period to think and extra periods left,
                   lets go ahead and use the period up.
                */
                if (state.clock.black_time.thinking_time === 0 && state.clock.black_time.periods > 1 && black_timeleft < state.time_control.period_time / 2) {
                    black_timeleft = Math.max( Math.floor(state.time_control.period_time - black_offset) + state.time_control.period_time, 0 );
                    state.clock.black_time.periods--;
                }

                if (state.clock.white_time.thinking_time === 0 && state.clock.white_time.periods > 1 && white_timeleft < state.time_control.period_time / 2) {
                    white_timeleft = Math.max( Math.floor(state.time_control.period_time - white_offset) + state.time_control.period_time, 0 );
                    state.clock.white_time.periods--;
                }

                this.command("kgs-time_settings byoyomi " + state.time_control.main_time + " "
                    + Math.floor(state.time_control.period_time -
                        (state.clock.current_player === state.clock.black_player_id ? black_offset : white_offset)
                    )
                    + " " + state.time_control.periods);

                /* Turns out in Japanese byoyomi mode, for Leela and pacci,
                   they expect time left in the current byoyomi period on time_left.
                */

                this.command("time_left black " + black_timeleft + " " + (state.clock.black_time.thinking_time > 0 ? "0" : state.clock.black_time.periods));
                this.command("time_left white " + white_timeleft + " " + (state.clock.white_time.thinking_time > 0 ? "0" : state.clock.white_time.periods));
            } else {
                /* OGS enforces the number of periods is always 1 or greater.
                   Let's pretend the final period is a Canadian Byoyomi of 1 stone.
                   This lets the bot know it can use the full period per move,
                   not try to fit the rest of the game into the time left.
                */
                let black_timeleft = Math.max( Math.floor(state.clock.black_time.thinking_time
                    - black_offset + (state.clock.black_time.periods - 1) * state.time_control.period_time), 0);
                let white_timeleft = Math.max( Math.floor(state.clock.white_time.thinking_time
                    - white_offset + (state.clock.white_time.periods - 1) * state.time_control.period_time), 0);

                this.command("time_settings " + (state.time_control.main_time + (state.time_control.periods - 1) * state.time_control.period_time) + " "
                    + Math.floor(state.time_control.period_time -
                        (state.clock.current_player === state.clock.black_player_id
                            ? (black_timeleft > 0 ? 0 : black_offset) : (white_timeleft > 0 ? 0 : white_offset)
                        )
                    )
                    + " 1");
                /* Since we're faking byoyomi using Canadian, time_left actually
                   does mean the time left to play our 1 stone.
                */
                this.command("time_left black " + (black_timeleft > 0 ? black_timeleft + " 0"
                    : Math.floor(state.time_control.period_time - black_offset) + " 1") );
                this.command("time_left white " + (white_timeleft > 0 ? white_timeleft + " 0"
                    : Math.floor(state.time_control.period_time - white_offset) + " 1") );
            }
        } else if (state.time_control.system === 'canadian') {
            /* Canadian Byoyomi is the only time controls GTP v2 officially supports.
            */ 
            let black_timeleft = Math.max( Math.floor(state.clock.black_time.thinking_time - black_offset), 0);
            let white_timeleft = Math.max( Math.floor(state.clock.white_time.thinking_time - white_offset), 0);

            if (config.kgstime) {
                this.command("kgs-time_settings canadian " + state.time_control.main_time + " "
                    + state.time_control.period_time + " " + state.time_control.stones_per_period);
            } else {
                this.command("time_settings " + state.time_control.main_time + " "
                    + state.time_control.period_time + " " + state.time_control.stones_per_period);
            }

            this.command("time_left black " + (black_timeleft > 0 ? black_timeleft + " 0"
                : Math.floor(state.clock.black_time.block_time - black_offset) + " " + state.clock.black_time.moves_left));
            this.command("time_left white " + (white_timeleft > 0 ? white_timeleft + " 0"
                : Math.floor(state.clock.white_time.block_time - white_offset) + " " + state.clock.white_time.moves_left));
        } else if (state.time_control.system === 'fischer') {
            /* Not supported by kgs-time_settings and I assume most bots.
               A better way than absolute is to handle this with
               a fake Canadian byoyomi. This should let the bot know
               a good approximation of how to handle the time remaining.
            */
            let black_timeleft = Math.max( Math.floor(state.clock.black_time.thinking_time - black_offset), 0);
            let white_timeleft = Math.max( Math.floor(state.clock.white_time.thinking_time - white_offset), 0);

            if (config.kgstime) {
                this.command("kgs-time_settings canadian " + (state.time_control.initial_time - state.time_control.time_increment)
                    + " " + state.time_control.time_increment + " 1");
            } else {
                this.command("time_settings " + (state.time_control.initial_time - state.time_control.time_increment)
                    + " " + state.time_control.time_increment + " 1");
            }

            /* Always tell the bot we are in main time ('0') so it doesn't try
               to think all of timeleft per move.
               But subtract the increment time above to avoid timeouts.
            */
            this.command("time_left black " + black_timeleft + " 0");
            this.command("time_left white " + white_timeleft + " 0");
        } else if (state.time_control.system === 'simple') {
            /* Simple could also be viewed as a Canadian byomoyi that starts
               immediately with # of stones = 1
            */
            this.command("time_settings 0 " + state.time_control.per_move + " 1");

            if (state.clock.black_time)
            {
                let black_timeleft = Math.max( Math.floor((state.clock.black_time - now)/1000 - black_offset), 0);
                this.command("time_left black " + black_timeleft + " 1");
                this.command("time_left white 1 1");
            } else {
                let white_timeleft = Math.max( Math.floor((state.clock.white_time - now)/1000 - white_offset), 0);
                this.command("time_left black 1 1");
                this.command("time_left white " + white_timeleft + " 1");
            }
        } else if (state.time_control.system === 'absolute') {
            let black_timeleft = Math.max( Math.floor(state.clock.black_time.thinking_time - black_offset), 0);
            let white_timeleft = Math.max( Math.floor(state.clock.white_time.thinking_time - white_offset), 0);

            if (config.kgstime) {
                this.command("kgs-time_settings absolute " + state.time_control.total_time);
            } else {
                this.command("time_settings " + state.time_control.total_time + " 0 0");
            }
            this.command("time_left black " + black_timeleft + " 0");
            this.command("time_left white " + white_timeleft + " 0");
        }
        /*  OGS doesn't actually send 'none' time control type
            else if (state.time_control.system === 'none') {
                if (config.kgstime) {
                    this.command("kgs-time_settings none");
                } else {
                    // GTP v2 says byoyomi time > 0 and stones = 0 means no time limits
                    //
                    this.command("time_settings 0 1 0");
                }
            }
        */
    }
    
    loadState(state, cb, eb) {
        if (this.dead) {
            if (config.DEBUG) { this.log("Attempting to load dead bot") }
            this.failed = true;
            if (eb) { eb() }
            return false;
        }

        if (state.width === state.height) {
            this.command(`boardsize ${state.width}`, () => {}, eb);
        } else {
            this.command(`boardsize ${state.width} ${state.height}`, () => {}, eb);
        }
        this.command("clear_board", () => {}, eb);
        this.command(`komi ${state.komi}`, () => {}, eb);
        //this.log(state);

        //this.loadClock(state);

        let have_initial_state = false;
        if (state.initial_state) {
            const black = decodeMoves(state.initial_state.black, state.width, state.height);
            const white = decodeMoves(state.initial_state.white, state.width, state.height);
            have_initial_state = (black.length || white.length);

            for (let i = 0; i < black.length; ++i)
                this.command(`play black ${move2gtpvertex(black[i], state.width, state.height)}`, () => {}, eb);
            for (let i = 0; i < white.length; ++i)
                this.command(`play white ${move2gtpvertex(white[i], state.width, state.height)}`, () => {}, eb);
        }

        // Replay moves made
        let color = state.initial_player;
        const doing_handicap = (!have_initial_state && state.free_handicap_placement && state.handicap > 1);
        const handicap_moves = [];
        const moves = decodeMoves(state.moves, state.width, state.height);
        for (let i = 0; i < moves.length; ++i) {
            const move = moves[i];

            // Use set_free_handicap for handicap stones, play otherwise.
            if (doing_handicap && handicap_moves.length < state.handicap) {
                handicap_moves.push(move);
                if (handicap_moves.length === state.handicap)
                    this.sendHandicapMoves(handicap_moves, state.width, state.height);
                else continue;  // don't switch color.
            } else {
                this.command(`play ${color} ${move2gtpvertex(move, state.width, state.height)}`)
            }

            color = (color === 'black' ? 'white' : 'black');
        }
        if (config.showboard) {
            this.command("showboard", cb, eb);
        }
        return true;
    }

    command(str, cb, eb, final_command) {
        if (this.dead) {
            if (config.DEBUG) { this.log("Attempting to send a command to dead bot:", str) }
            this.failed = true;
            if (eb) { eb() }
            return;
        }

        this.command_callbacks.push(cb);
        this.command_error_callbacks.push(eb);
        if (config.DEBUG) {
            this.log(">>>", str);
        }
        try {
            if (config.json) {
                if (!this.json_initialized) {
                    this.proc.stdin.write(`{"gtp_commands": [`);
                    this.json_initialized = true;
                } else {
                    this.proc.stdin.write(",");
                }
                this.proc.stdin.write(JSON.stringify(str));
                if (final_command) {
                    this.proc.stdin.write("]}");
                    this.proc.stdin.end()
                }
            } else {
                this.proc.stdin.write(`${str}\r\n`);
            }
        } catch (e) {
            // I think this does not normally happen, the exception will usually be raised in the async write handler
            // and delivered through an 'error' event.
            //
            this.log("Failed to send command: ", str);
            this.log(e);
            this.dead = true;
            this.failed = true;
            // Already calling the callback!
            this.command_error_callbacks.shift();
            if (eb) eb(e);
        }
    }

    // For commands like genmove, place_free_handicap ... :
    // Send @cmd to engine and call @cb with returned moves.
    // TODO: We may want to have a timeout here, in case bot crashes. Set it before this.command, clear it in the callback?
    //
    getMoves(cmd, state, cb, eb) {
        // Do this here so we only do it once, plus if there is a long delay between clock message and move message, we'll
        // subtract that missing time from what we tell the bot.
        //
        this.loadClock(state);

        // Only relevent with persistent bots. Leave the setting on until we actually have requested a move.
        // Must be after loadClock() since loadClock() checks this.firstmove!
        //
        this.firstmove = false;

        this.command(cmd, (line) => {
            line = typeof(line) === "string" ? line.toLowerCase() : null;
            const parts = line.split(/ +/);
            const moves = [];

            for (let i = 0; i < parts.length; i++) {
                const move = parts[i];

                let resign = move === 'resign';
                const pass = move === 'pass';
                let x = -1,
                    y = -1;
                if (!resign && !pass) {
                    if (move && move[0]) {
                        x = gtpchar2num(move[0]);
                        y = state.height - parseInt(move.substr(1))
                    } else {
                        this.log(`${cmd} failed, resigning`);
                        resign = true;
                    }
                }
                moves.push({'x': x, 'y': y, 'text': move, 'resign': resign, 'pass': pass});
            }

            cb(moves);
        },
            eb,
            true /* final command */
        )
    }

    kill() {
        this.log("Stopping bot");
        this.ignore = true;  // Prevent race conditions / inconsistencies. Could be in the middle of genmove ...
        // "quit" needs to be sent before we toggle this.dead since command() checks the status of this.dead
        this.command("quit");
        this.dead = true;
        if (this.proc) {
            this.proc.kill();
            setTimeout(() => {
                // To be 100% sure.
                if (config.DEBUG) this.log("Killing process directly with a signal");
                this.proc.kill(9);
            }, 5000);
        }
    }
    sendMove(move, width, height, color){
        if (config.DEBUG) this.log("Calling sendMove with", move2gtpvertex(move, width, height));
        this.command(`play ${color} ${move2gtpvertex(move, width, height)}`);
    }
    sendHandicapMoves(moves, width, height) {
        let cmd = "set_free_handicap";
        for (let i = 0; i < moves.length; i++)
            cmd += ` ${move2gtpvertex(moves[i], width, height)}`;
        this.command(cmd);
    }
    // Called on game over, in case you need something special.
    //
    gameOver() {
    }
}

exports.Bot = Bot;
