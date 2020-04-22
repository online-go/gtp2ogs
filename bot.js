// vim: tw=120 softtabstop=4 shiftwidth=4

const split2 = require('split2');
const { char2num } = require("./utils/char2num");
const { gtpchar2num } = require("./utils/gtpchar2num");

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

        try {
            this.proc = child_process.spawn(cmd[0], cmd.slice(1));
        } catch (e) {
            this.log("Failed to start the bot: ", e);
            this.ignore = true;
            this.dead = true;
            this.failed = true;
            return;
        }

        if (config.DEBUG) this.log("Starting ", cmd.join(' '));

        this.proc.stderr.pipe(split2()).on('data', (data) => {
            if (this.ignore)  return;
            const errline = data.toString().trim();
            if (errline === "") return;
            this.error(`stderr: ${errline}`);

            if (config.ogspv) this.pv.postPvToChat(errline);
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

        //const now = state.clock.now ? state.clock.now : (Date.now() - this.conn.clock_drift);
        const now = Date.now() - this.conn.clock_drift;

        const blackObj = { color:    "black",
                           offset:   0,
                           timeleft: 0
                         };
        const whiteObj = { color:    "white",
                           offset:   0,
                           timeleft: 0
                         };

        const offset = ((this.firstmove ? config.startupbuffer : 0) + now - state.clock.last_move) / 1000;
        const currentPlayerObj = getCurrentPlayerObj(blackObj, whiteObj, state.clock);
        currentPlayerObj.offset = offset;

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
                assignByoyomiKgsTimeleft(blackObj, state);
                assignByoyomiKgsTimeleft(whiteObj, state);

                /* Restarting the bot can make a time left so small the bot makes a 
                   rushed terrible move.
                   If we have less than half a period to think and extra periods left,
                   lets go ahead and use the period up.
                */
              
                adjustByoyomiKgsTimeleftAndPeriods(blackObj, state);
                adjustByoyomiKgsTimeleftAndPeriods(whiteObj, state);

                const periodTimeInfo = Math.floor(state.time_control.period_time - currentPlayerObj.offset);
                this.command(`kgs-time_settings byoyomi ${state.time_control.main_time} ${periodTimeInfo} ${state.time_control.periods}`);

                /* Turns out in Japanese byoyomi mode, for Leela and pacci,
                   they expect time left in the current byoyomi period on time_left.
                */
                this.command(getByoyomiKgsTimeleft(blackObj, state));
                this.command(getByoyomiKgsTimeleft(whiteObj, state));

            } else {
                /* OGS enforces the number of periods is always 1 or greater.
                   Let's pretend the final period is a Canadian Byoyomi of 1 stone.
                   This lets the bot know it can use the full period per move,
                   not try to fit the rest of the game into the time left.
                */
                assignByoyomiTimeleft(blackObj, state);
                assignByoyomiTimeleft(whiteObj, state);

                const timeSettings = `${state.time_control.main_time} ${(state.time_control.periods - 1) * state.time_control.period_time}`;
                const offsetInfo = Math.floor( state.time_control.period_time - (currentPlayerObj.timeleft > 0 ? 0 : currentPlayerObj.offset) );
                this.command(`time_settings ${timeSettings} ${offsetInfo} 1`);

                /* Since we're faking byoyomi using Canadian, time_left actually
                   does mean the time left to play our 1 stone.
                */
                this.command(getByoyomiTimeleft(blackObj, state));
                this.command(getByoyomiTimeleft(whiteObj, state));
            }

        } else if (state.time_control.system === 'canadian') {
            /* Canadian Byoyomi is the only time controls GTP v2 officially supports.
            */
            assignCanadianTimeleft(blackObj, state);
            assignCanadianTimeleft(whiteObj, state);

            const time_settings_name = getTimeSettingsName(config.kgstime, "canadian");
            const timeSettingsInfo = `${state.time_control.main_time} ${state.time_control.period_time} ${state.time_control.stones_per_period}`;
            this.command(`${time_settings_name} ${timeSettingsInfo}`);

            this.command(getCanadianTimeleft(blackObj, state));
            this.command(getCanadianTimeleft(whiteObj, state));

        } else if (state.time_control.system === 'fischer') {
            /* Not supported by kgs-time_settings and I assume most bots.
               A better way than absolute is to handle this with
               a fake Canadian byoyomi. This should let the bot know
               a good approximation of how to handle the time remaining.
            */
            assignFischerTimeleft(blackObj, state);
            assignFischerTimeleft(whiteObj, state);

            const time_settings_name = getTimeSettingsName(config.kgstime, "canadian");
            const timeSettingsInfo = `${state.time_control.initial_time - state.time_control.time_increment} ${state.time_control.time_increment} 1`;
            this.command(`${time_settings_name} ${timeSettingsInfo}`);

            /* Always tell the bot we are in main time ('0') so it doesn't try
               to think all of timeleft per move.
               But subtract the increment time above to avoid timeouts.
            */
            this.command(getFischerTimeleft(blackObj));
            this.command(getFischerTimeleft(whiteObj));

        } else if (state.time_control.system === 'simple') {
            /* Simple could also be viewed as a Canadian byomoyi that starts
               immediately with # of stones = 1
            */
            this.command(`time_settings 0 ${state.time_control.per_move} 1`);

            assignSimpleTimeleft(blackObj, state, now);
            assignSimpleTimeleft(whiteObj, state, now);

            this.command(getSimpleTimeleft(blackObj, state));
            this.command(getSimpleTimeleft(whiteObj, state));

        } else if (state.time_control.system === 'absolute') {
            assignAbsoluteTimeleft(blackObj, state);
            assignAbsoluteTimeleft(whiteObj, state);

            const time_settings_name = getTimeSettingsName(config.kgstime, "absolute");
            const timeSettingsInfo = `${state.time_control.total_time}${(config.kgstime ? "" : " 0 0")}`;
            this.command(`${time_settings_name} ${timeSettingsInfo}`);

            this.command(getAbsoluteTimeleft(blackObj));
            this.command(getAbsoluteTimeleft(whiteObj));
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

        this.command(`boardsize ${state.width}`, () => {}, eb);
        this.command("clear_board", () => {}, eb);
        this.command(`komi ${state.komi}`, () => {}, eb);
        //this.log(state);

        //this.loadClock(state);

        let have_initial_state = false;
        if (state.initial_state) {
            const black = decodeMoves(state.initial_state.black, state.width);
            const white = decodeMoves(state.initial_state.white, state.width);
            have_initial_state = (black.length || white.length);

            for (let i = 0; i < black.length; ++i)
                this.command(`play black ${move2gtpvertex(black[i], state.width)}`, () => {}, eb);
            for (let i = 0; i < white.length; ++i)
                this.command(`play white ${move2gtpvertex(white[i], state.width)}`, () => {}, eb);
        }

        // Replay moves made
        let color = state.initial_player;
        const doing_handicap = (!have_initial_state && state.free_handicap_placement && state.handicap > 1);
        const handicap_moves = [];
        const moves = decodeMoves(state.moves, state.width);
        for (let i = 0; i < moves.length; ++i) {
            const move = moves[i];

            // Use set_free_handicap for handicap stones, play otherwise.
            if (doing_handicap && handicap_moves.length < state.handicap) {
                handicap_moves.push(move);
                if (handicap_moves.length === state.handicap)
                    this.sendHandicapMoves(handicap_moves, state.width);
                else continue;  // don't switch color.
            } else {
                this.command(`play ${color} ${move2gtpvertex(move, state.width)}`)
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
                        y = state.width - parseInt(move.substr(1))
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
        this.dead = true;
        this.command("quit");
        if (this.proc) {
            this.proc.kill();
            setTimeout(() => {
                // To be 100% sure.
                if (config.DEBUG) this.log("Killing process directly with a signal");
                this.proc.kill(9);
            }, 5000);
        }
    }
    sendMove(move, width, color){
        if (config.DEBUG) this.log("Calling sendMove with", move2gtpvertex(move, width));
        this.command(`play ${color} ${move2gtpvertex(move, width)}`);
    }
    sendHandicapMoves(moves, width) {
        let cmd = "set_free_handicap";
        for (let i = 0; i < moves.length; i++)
            cmd += ` ${move2gtpvertex(moves[i], width)}`;
        this.command(cmd);
    }
    // Called on game over, in case you need something special.
    //
    gameOver() {
    }
}

function checkAmICurrentPlayer(obj, stateClock) {
    return stateClock.current_player === stateClock[`${obj.color}_player_id`];
}
function getCurrentPlayerObj(blackObj, whiteObj, stateClock) {
    return (checkAmICurrentPlayer(blackObj, stateClock) ? blackObj : whiteObj);
}
function getTimeSettingsName(configKgstime, timecontrol) {
    if (configKgstime) return `kgs-time_settings ${timecontrol}`;
    return "time_settings";
}
function assignByoyomiKgsTimeleft(obj, state) {
    if (state.clock[`${obj.color}_time`].thinking_time > 0) {
        obj.timeleft = Math.max( Math.floor(state.clock[`${obj.color}_time`].thinking_time - obj.offset), 0);
    } else {
        obj.timeleft = Math.max( Math.floor(state.time_control.period_time - obj.offset), 0);
    }
}
function adjustByoyomiKgsTimeleftAndPeriods(obj, state) {
    if (state.clock[`${obj.color}_time`].thinking_time === 0
        && state.clock[`${obj.color}_time`].periods > 1
        && obj.timeleft < state.time_control.period_time / 2) {

        obj.timeleft = Math.max( Math.floor(state.time_control.period_time - obj.offset) + state.time_control.period_time, 0 );
        state.clock[`${obj.color}_time`].periods--;
    }
}
function getByoyomiKgsTimeleft(obj, state) {
    const timeleftInfo = (state.clock[`${obj.color}_time`].thinking_time > 0 ? "0"
                                                                             : state.clock[`${obj.color}_time`].periods);
    return `time_left ${obj.color} ${obj.timeleft} ${timeleftInfo}`;
}
function assignByoyomiTimeleft(obj, state) {
    obj.timeleft = Math.max( Math.floor(state.clock[`${obj.color}_time`].thinking_time
                                        - obj.offset + (state.clock[`${obj.color}_time`].periods - 1)
                             * state.time_control.period_time), 0 );                   
}
function getByoyomiTimeleft(obj, state) {
    const timeleftInfo = ( obj.timeleft > 0 ? `${obj.timeleft} 0`
                                            : `${Math.floor(state.time_control.period_time - obj.offset)} 1` );
    return `time_left ${obj.color} ${timeleftInfo}`;              
}
function assignCanadianTimeleft(obj, state) {
    obj.timeleft = Math.max( Math.floor(state.clock[`${obj.color}_time`].thinking_time - obj.offset), 0 );
}
function getCanadianTimeleft(obj, state) {
    const timeleftInfo = ( obj.timeleft > 0 ? `${obj.timeleft} 0`
                                            : (`${Math.floor(state.clock[`${obj.color}_time`].block_time - obj.offset)} `
                                               + `${state.clock[`${obj.color}_time`].moves_left}`) );
    return `time_left ${obj.color} ${timeleftInfo}`;    
}
function assignFischerTimeleft(obj, state) {
    obj.timeleft = Math.max( Math.floor(state.clock[`${obj.color}_time`].thinking_time - obj.offset), 0 );
}
function getFischerTimeleft(obj) {
    return `time_left ${obj.color} ${obj.timeleft} 0`;     
}
function assignSimpleTimeleft(obj, state, now) {
    if (state.clock[`${obj.color}_time`]) {
        obj.timeleft = Math.max( Math.floor((state.clock[`${obj.color}_time`] - now) / 1000 - obj.offset), 0 );
    }
}
function getSimpleTimeleft(obj, state) {
    if (state.clock[`${obj.color}_time`]) {
        return `time_left ${obj.color} ${obj.timeleft} 1`;
    }
    return `time_left ${obj.color} 1 1`;
}
function assignAbsoluteTimeleft(obj, state) {
    obj.timeleft = Math.max( Math.floor(state.clock[`${obj.color}_time`].thinking_time - obj.offset), 0 );
}
function getAbsoluteTimeleft(obj) {
    return `time_left ${obj.color} ${obj.timeleft} 0`;
}

function decodeMoves(move_obj, board_size) {
    const ret = [];
    const width = board_size;
    const height = board_size;

    /*
    if (DEBUG) {
        console.log("Decoding ", move_obj);
    }
    */

   const decodeSingleMoveArray = (arr) => {
        const obj = {
            x         : arr[0],
            y         : arr[1],
            timedelta : arr.length > 2 ? arr[2] : -1,
            color     : arr.length > 3 ? arr[3] : 0,
        }
        const extra = arr.length > 4 ? arr[4] : {};
        for (const k in extra) {
            obj[k] = extra[k];
        }
        return obj;
    }

    if (move_obj instanceof Array) {
        if (move_obj.length && typeof(move_obj[0]) === 'number') {
            ret.push(decodeSingleMoveArray(move_obj));
        }
        else {
            for (let i = 0; i < move_obj.length; ++i) {
                const mv = move_obj[i];
                if (mv instanceof Array) {
                    ret.push(decodeSingleMoveArray(mv));
                }
                else { 
                    throw new Error("Unrecognized move format: ", mv);
                }
            }
        }
    } 
    else if (typeof(move_obj) === "string") {

        if (/[a-zA-Z][0-9]/.test(move_obj)) {
            /* coordinate form, used from human input. */
            const move_string = move_obj;

            const moves = move_string.split(/([a-zA-Z][0-9]+|[.][.])/);
            for (let i = 0; i < moves.length; ++i) {
                if (i%2) { /* even are the 'splits', which should always be blank unless there is an error */
                    let x = pretty_char2num(moves[i][0]);
                    let y = height-parseInt(moves[i].substring(1));
                    if ( ((width && x >= width) || x < 0) ||
                         ((height && y >= height) || y < 0) ) {
                        x = y = -1;
                    }
                    ret.push({"x": x, "y": y, "edited": false, "color": 0});
                } else {
                    if (moves[i] !== "") { 
                        throw `Unparsed move input: ${moves[i]}`;
                    }
                }
            }
        } else {
            /* Pure letter encoded form, used for all records */
            const move_string = move_obj;

            for (let i = 0; i < move_string.length-1; i += 2) {
                let edited = false;
                let color = 0;
                if (move_string[i + 0] === '!') {
                    edited = true;
                    color = parseInt(move_string[i + 1]);
                    i += 2;
                }


                let x = char2num(move_string[i]);
                let y = char2num(move_string[i + 1]);
                if ((width && x >= width) || (height && y >= height)) {
                    x = y = -1;
                }
                ret.push({"x": x, "y": y, "edited": edited, "color": color});
            }
        }
    } 
    else {
        throw new Error("Invalid move format: ", move_obj);
    }

    return ret;
}
function pretty_char2num(ch) {
    if (ch === ".") return -1;
    return "abcdefghjklmnopqrstuvwxyz".indexOf(ch.toLowerCase());
}
function move2gtpvertex(move, board_size) {
    if (move.x < 0) {
        return "pass";
    }
    return num2gtpchar(move['x']) + (board_size-move['y'])
}
function num2gtpchar(num) {
    if (num === -1) 
        return ".";
    return "abcdefghjklmnopqrstuvwxyz"[num];
}

exports.Bot = Bot;
exports.decodeMoves = decodeMoves;
exports.move2gtpvertex = move2gtpvertex;
