#!/usr/bin/env node

'use strict';

process.title = 'gtp2ogs';
let DEBUG = false;
let PERSIST = false;
let KGSTIME = false;
let NOCLOCK = false;
let GREETING = "";
let FAREWELL = "";

let spawn = require('child_process').spawn;
let os = require('os')
let fs = require('fs')
let io = require('socket.io-client');
let querystring = require('querystring');
let http = require('http');
let https = require('https');
let crypto = require('crypto');
let tracer = require('tracer');
let sprintf = require('sprintf-js').sprintf;

let optimist = require("optimist")
    .usage("Usage: $0 --username <bot-username> --apikey <apikey> [arguments] -- botcommand [bot arguments]")
    .alias('username', 'botid')
    .alias('username', 'bot')
    .alias('username', 'id')
    .alias('debug', 'd')
    .alias('json', 'j')
    .demand('username')
    .demand('apikey')
    .describe('username', 'Specify the username of the bot')
    .describe('apikey', 'Specify the API key for the bot')
    .describe('host', 'OGS Host to connect to')
    .default('host', 'online-go.com')
    .describe('port', 'OGS Port to connect to')
    .default('port', 443)
    .describe('timeout', 'Disconnect from a game after this many seconds (if set)')
    .default('timeout', 0)
    .describe('insecure', "Don't use ssl to connect to the ggs/rest servers")
    .describe('beta', 'Connect to the beta server (sets ggs/rest hosts to the beta server)')
    .describe('debug', 'Output GTP command and responses from your Go engine')
    .describe('json', 'Send and receive GTP commands in a JSON encoded format')
    .describe('persist', 'Bot process remains running between moves')
    .describe('kgstime', 'Set this if bot understands the kgs-time_settings command')
    .describe('noclock', 'Do not send any clock/time data to the bot')
    .describe('corrqueue', 'Process correspondence games one at a time')
    .describe('startupbuffer', 'Subtract this many seconds from time available on first move')
    .default('startupbuffer', 5)
    .describe('rejectnew', 'Reject all new challenges')
    .describe('rejectnewfile', 'Reject new challenges if file exists (checked each time, can use for load-balancing)')
    .describe('boardsize', 'Board size(s) to accept')
    .string('boardsize')
    .default('boardsize', '9,13,19')
    .describe('komi', 'Allowed komi values')
    .string('komi')
    .default('komi', 'null')
    // behaviour : when --komi is not used default is "null" (Automatic) and other komi values will be rejected, 
    //but if --komi argument is used with the wanted komi value(s) then only these values will be allowed instead
    // example : --komi null,0.5,7.5 or --komi 7.5
    // TODO : re-add the ability to accept any komi value (other than null) when --komi is not used
    .describe('ban', 'Comma separated list of user names or IDs')
    .string('ban')
    .describe('banranked', 'Comma separated list of user names or IDs')
    .string('banranked')
    .describe('banunranked', 'Comma separated list of user names or IDs')
    .string('banunranked')
    .describe('speed', 'Game speed(s) to accept')
    .default('speed', 'blitz,live,correspondence')
    .describe('timecontrol', 'Time control(s) to accept')
    .default('timecontrol', 'fischer,byoyomi,simple,canadian,absolute,none')
    .describe('minmaintime', 'Minimum seconds of main time (rejects time control simple and none)')
    .describe('maxmaintime', 'Maximum seconds of main time (rejects time control simple and none)')
    .describe('minperiodtime', 'Minimum seconds per period (per stone in canadian)')
    .describe('maxperiodtime', 'Maximum seconds per period (per stone in canadian)')
    .describe('minperiods', 'Minimum number of periods')
    .describe('minperiodsranked', 'Minimum number of ranked periods')
    .describe('minperiodsunranked', 'Minimum number of unranked periods')
    .describe('maxperiods', 'Maximum number of periods')
    .describe('maxperiodsranked', 'Maximum number of ranked periods')
    .describe('maxperiodsunranked', 'Maximum number of unranked periods')
    .describe('maxtotalgames', 'Maximum number of total games')
    .describe('maxactivegames', 'Maximum number of active games per player')
    .describe('minrank', 'Minimum opponent rank to accept (ex: 15k)')
    .string('minrank')
    .describe('maxrank', 'Maximum opponent rank to accept (ex: 1d)')
    .string('maxrank')
    .describe('greeting', 'Greeting message to appear in chat at first move (ex: "Hello, have a nice game")')
    .string('greeting')
    .describe('farewell', 'Thank you message to appear in chat at end of game (ex: "Thank you for playing")')
    .string('farewell')
    .describe('proonly', 'Only accept matches from professionals')
    .describe('rankedonly', 'Only accept ranked matches')
    .describe('unrankedonly', 'Only accept unranked matches')
    .describe('minhandicap', 'Min handicap for all games')
    .describe('maxhandicap', 'Max handicap for all games')
    .describe('minrankedhandicap', 'Min handicap for ranked games')
    .describe('maxrankedhandicap', 'Max handicap for ranked games')
    .describe('minunrankedhandicap', 'Min handicap for unranked games')
    .describe('maxunrankedhandicap', 'Max handicap for unranked games')
    .describe('nopause', 'Do not allow games to be paused')
    .describe('nopauseranked', 'Do not allow ranked games to be paused')
    .describe('nopauseunranked', 'Do not allow unranked games to be paused')
    .describe('hidden', 'Don\'t list the bot in the public challenge list')
;
let argv = optimist.argv;

if (!argv._ || argv._.length == 0) {
    optimist.showHelp();
    process.exit();
}

// Convert timeout to microseconds once here so we don't need to do it each time it is used later.
//
if (argv.timeout) {
    argv.timeout = argv.timeout * 1000;
}

if (argv.startupbuffer) {
    argv.startupbuffer = argv.startupbuffer * 1000;
}

if (argv.beta) {
    argv.host = 'beta.online-go.com';
}

if (argv.debug) {
    DEBUG = true;
}

if (argv.persist) {
    PERSIST = true;
}

// TODO: Test known_commands for kgs-time_settings to set this, and remove the command line option
if (argv.kgstime) {
    KGSTIME = true;
}

if (argv.noclock) {
    NOCLOCK = true;
}

function check_rejectnew()
{
    if (argv.rejectnew)  return true;
    if (argv.rejectnewfile && fs.existsSync(argv.rejectnewfile))  return true;
    return false;
}

let allowed_sizes = [];

if (argv.boardsize) {
    for (let i of argv.boardsize.split(',')) {
        allowed_sizes[i] = true;
    }
}

let allowed_komi = [];

if (argv.komi) {
    for (let i of argv.komi.split(',')) {
        allowed_komi[i] = true;
    }
}

let allowed_speeds = {};

if (argv.speed) {
    for (let i of argv.speed.split(',')) {
        allowed_speeds[i] = true;
    }
}

let allowed_timecontrols = {};

if (argv.timecontrol) {
    for (let i of argv.timecontrol.split(',')) {
        allowed_timecontrols[i] = true;
    }
}

let banned_users = {};

if (argv.ban) {
    for (let i of argv.ban.split(',')) {
        banned_users[i] = true;
    }
}

let banned_ranked_users = {};

if (argv.banranked) {
    for (let i of argv.banranked.split(',')) {
        banned_ranked_users[i] = true;
    }
}

let banned_unranked_users = {};

if (argv.banunranked) {
    for (let i of argv.banunranked.split(',')) {
        banned_unranked_users[i] = true;
    }
}

if (argv.minrank) {
    let re = /(\d+)([kdp])/;
    let results = argv.minrank.toLowerCase().match(re);

    if (results) {
        if (results[2] == "k") {
            argv.minrank = 30 - parseInt(results[1]);
        } else if (results[2] == "d") {
            argv.minrank = 30 - 1 + parseInt(results[1]);
        } else if (results[2] == "p") {
            argv.minrank = 36 + parseInt(results[1]);
            argv.proonly = true;
        } else {
            console.error("Invalid minrank " + argv.minrank);
            process.exit();
        }
    } else {
        console.error("Could not parse minrank " + argv.minrank);
        process.exit();
    }
}

if (argv.maxrank) {
    let re = /(\d+)([kdp])/;
    let results = argv.maxrank.toLowerCase().match(re);

    if (results) {
        if (results[2] == "k") {
            argv.maxrank = 30 - parseInt(results[1]);
        } else if (results[2] == "d") {
            argv.maxrank = 30 - 1 + parseInt(results[1]);
        } else if (results[2] == "p") {
            argv.maxrank = 36 + parseInt(results[1]);
        } else {
            console.error("Invalid maxrank " + argv.maxrank);
            process.exit();
        }
    } else {
        console.error("Could not parse maxrank " + argv.maxrank);
        process.exit();
    }
}

if (argv.greeting) {
    GREETING = argv.greeting;
}
if (argv.farewell) {
    FAREWELL = argv.farewell;
}


let bot_command = argv._;
let moves_processing = 0;
let corr_moves_processing = 0;

process.title = 'gtp2ogs ' + bot_command.join(' ');


let console_fmt = "{{timestamp}} {{title}} {{message}}";
if (DEBUG)
    console_fmt = "{{timestamp}} {{title}} {{file}}:{{line}}{{space}} {{message}}";

let console = tracer.colorConsole({
    format : [ console_fmt ],
    dateformat: 'mmm dd HH:MM:ss',
    preprocess :  function(data){
        switch (data.title) {
            case 'debug': data.title = ' '; break;
            case 'log': data.title = ' '; break;
            case 'info': data.title = ' '; break;
            case 'warn': data.title = '!'; break;
            case 'error': data.title = '!!!!!'; break;
        }
        if (DEBUG) data.space = " ".repeat(Math.max(0, 30 - `${data.file}:${data.line}`.length));
    }
});

process.on('uncaughtException', function (er) {
  console.trace("ERROR: Uncaught exception");
  console.error("ERROR: " + er.stack);
  if (!conn || !conn.socket) {
    conn = new Connection();
  } else {
    //conn.connection_reset();
  }
})


/*********/
/** Bot **/
/*********/
class Bot {
    constructor(conn, game, cmd) {{{
        this.conn = conn;
        this.game = game;
        this.proc = spawn(cmd[0], cmd.slice(1));
        this.commands_sent = 0;
        this.command_callbacks = [];
        this.firstmove = true;
        this.ignore = false;   // Ignore output from bot ?

        if (DEBUG) this.log("Starting ", cmd.join(' '));

        this.proc.stderr.on('data', (data) => {
            if (this.ignore)  return;
            this.error("stderr: " + data);
        });
        let stdout_buffer = "";
        this.proc.stdout.on('data', (data) => {
            if (this.ignore)  return;
            stdout_buffer += data.toString();

            if (argv.json) {
                try {
                    stdout_buffer = JSON.parse(stdout_buffer);
                } catch (e) {
                    // Partial result received, wait until we can parse the result
                    return;
                }
            }

            if (!stdout_buffer || stdout_buffer[stdout_buffer.length-1] != '\n') {
                //this.log("Partial result received, buffering until the output ends with a newline");
                return;
            }
            if (DEBUG) {
                this.log("<<<", stdout_buffer);
            }

            let lines = stdout_buffer.split("\n");
            stdout_buffer = "";
            for (let i=0; i < lines.length; ++i) {
                let line = lines[i];
                if (line.trim() == "") {
                    continue;
                }
                if (line[0] == '=') {
                    while (lines[i].trim() != "") {
                        ++i;
                    }
                    let cb = this.command_callbacks.shift();
                    if (cb) cb(line.substr(1).trim());
                }
                else if (line.trim()[0] == '?') {
                    this.log(line);
                    while (lines[i].trim() != "") {
                        ++i;
                        this.log(lines[i]);
                    }
                }
                else {
                    this.log("Unexpected output: ", line);
                    //throw new Error("Unexpected output: " + line);
                }
            }
        });
    }}}

    log(str) { /* {{{ */
        let arr = ["[" + this.proc.pid + "]"];
        for (let i=0; i < arguments.length; ++i) {
            arr.push(arguments[i]);
        }

        console.log.apply(null, arr);
    } /* }}} */
    error(str) { /* {{{ */
        let arr = ["[" + this.proc.pid + "]"];
        for (let i=0; i < arguments.length; ++i) {
            arr.push(arguments[i]);
        }

        console.error.apply(null, arr);
    } /* }}} */
    verbose(str) { /* {{{ */
        let arr = ["[" + this.proc.pid + "]"];
        for (let i=0; i < arguments.length; ++i) {
            arr.push(arguments[i]);
        }

        console.verbose.apply(null, arr);
    } /* }}} */
    loadClock(state) {
        //
        // References:
        // http://www.lysator.liu.se/~gunnar/gtp/gtp2-spec-draft2/gtp2-spec.html#sec:time-handling
        // http://www.weddslist.com/kgs/how/kgsGtp.html
        //
        // GTP v2 only supports Canadian byoyomi, no timer (see spec above), and absolute (period time zero).
        //
        // kgs-time_settings adds support for Japanese byoyomi.
        //
        // TODO: Use known_commands to check for kgs-time_settings support automatically.
        //
        // The kgsGtp interface (http://www.weddslist.com/kgs/how/kgsGtp.html) converts byoyomi to absolute time
        // for bots that don't support kgs-time_settings by using main_time plus periods * period_time. But then the bot
        // would view that as the total time left for entire rest of game...
        //
        // Japanese byoyomi with one period left could be viewed as a special case of Canadian byoyomi where the number of stones is always = 1
        //
        if (NOCLOCK) return;

        let black_offset = 0;
        let white_offset = 0;

        //let now = state.clock.now ? state.clock.now : (Date.now() - this.conn.clock_drift);
        let now = Date.now() - this.conn.clock_drift;

        if (state.clock.current_player == state.clock.black_player_id) {
            black_offset = ((this.firstmove==true ? argv.startupbuffer : 0) + now - state.clock.last_move) / 1000;
        } else {
            white_offset = ((this.firstmove==true ? argv.startupbuffer : 0) + now - state.clock.last_move) / 1000;
        }

        if (state.time_control.system == 'byoyomi') {
            // GTP spec says time_left should have 0 for stones until main_time has run out.
            //
            // If the bot connects in the middle of a byoyomi period, it won't know how much time it has left before the period expires.
            // When restarting the bot mid-match during testing, it sometimes lost on timeout because of this. To work around it, we can
            // reduce the byoyomi period size by the offset. Not strictly accurate but GTP protocol provides nothing better. Once bot moves
            // again, the next state setup should have this corrected. This problem would happen if a bot were to crash and re-start during
            // a period. This is only an issue if it is our turn, and our main time left is 0.
            //
            if (KGSTIME) {
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

                // Restarting the bot can make a time left so small the bot makes a rushed terrible move. If we have less than half a period
                // to think and extra periods left, lets go ahead and use the period up.
                //
                if (state.clock.black_time.thinking_time == 0 && state.clock.black_time.periods > 1 && black_timeleft < state.time_control.period_time / 2) {
                    black_timeleft = Math.max( Math.floor(state.time_control.period_time - black_offset) + state.time_control.period_time, 0 );
                    state.clock.black_time.periods--;
                }

                if (state.clock.white_time.thinking_time == 0 && state.clock.white_time.periods > 1 && white_timeleft < state.time_control.period_time / 2) {
                    white_timeleft = Math.max( Math.floor(state.time_control.period_time - white_offset) + state.time_control.period_time, 0 );
                    state.clock.white_time.periods--;
                }

                this.command("kgs-time_settings byoyomi " + state.time_control.main_time + " "
                    + Math.floor(state.time_control.period_time -
                        (state.clock.current_player == state.clock.black_player_id ? black_offset : white_offset)
                    )
                    + " " + state.time_control.periods);

                // Turns out in Japanese byoyomi mode, for Leela and pacci, they expect time left in the current byoyomi period on time_left
                //

                this.command("time_left black " + black_timeleft + " " + (state.clock.black_time.thinking_time > 0 ? "0" : state.clock.black_time.periods));
                this.command("time_left white " + white_timeleft + " " + (state.clock.white_time.thinking_time > 0 ? "0" : state.clock.white_time.periods));
            } else {
                // OGS enforces the number of periods is always 1 or greater. Let's pretend the final period is a Canadian Byoyomi of 1 stone.
                // This lets the bot know it can use the full period per move, not try to fit the rest of the game into the time left.
                //
                let black_timeleft = Math.max( Math.floor(state.clock.black_time.thinking_time
                    - black_offset + (state.clock.black_time.periods - 1) * state.time_control.period_time), 0);
                let white_timeleft = Math.max( Math.floor(state.clock.white_time.thinking_time
                    - white_offset + (state.clock.white_time.periods - 1) * state.time_control.period_time), 0);

                this.command("time_settings " + (state.time_control.main_time + (state.time_control.periods - 1) * state.time_control.period_time) + " "
                    + Math.floor(state.time_control.period_time -
                        (state.clock.current_player == state.clock.black_player_id
                            ? (black_timeleft > 0 ? 0 : black_offset) : (white_timeleft > 0 ? 0 : white_offset)
                        )
                    )
                    + " 1");
                // Since we're faking byoyomi using Canadian, time_left actually does mean the time left to play our 1 stone.
                //
                this.command("time_left black " + (black_timeleft > 0 ? black_timeleft + " 0"
                    : Math.floor(state.time_control.period_time - black_offset) + " 1") );
                this.command("time_left white " + (white_timeleft > 0 ? white_timeleft + " 0"
                    : Math.floor(state.time_control.period_time - white_offset) + " 1") );
            }
        } else if (state.time_control.system == 'canadian') {
            // Canadian Byoyomi is the only time controls GTP v2 officially supports.
            // 
            let black_timeleft = Math.max( Math.floor(state.clock.black_time.thinking_time - black_offset), 0);
            let white_timeleft = Math.max( Math.floor(state.clock.white_time.thinking_time - white_offset), 0);

            if (KGSTIME) {
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
        } else if (state.time_control.system == 'fischer') {
            // Not supported by kgs-time_settings and I assume most bots. A better way than absolute is to handle this with
            // a fake Canadian byoyomi. This should let the bot know a good approximation of how to handle
            // the time remaining.
            //
            let black_timeleft = Math.max( Math.floor(state.clock.black_time.thinking_time - black_offset), 0);
            let white_timeleft = Math.max( Math.floor(state.clock.white_time.thinking_time - white_offset), 0);

            if (KGSTIME) {
                this.command("kgs-time_settings canadian " + (state.time_control.initial_time - state.time_control.time_increment)
                    + " " + state.time_control.time_increment + " 1");
            } else {
                this.command("time_settings " + (state.time_control.initial_time - state.time_control.time_increment)
                    + " " + state.time_control.time_increment + " 1");
            }

            this.command("time_left black " + black_timeleft + " 1");
            this.command("time_left white " + white_timeleft + " 1");
        } else if (state.time_control.system == 'simple') {
            // Simple could also be viewed as a Canadian byomoyi that starts immediately with # of stones = 1
            //
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
        } else if (state.time_control.system == 'absolute') {
            let black_timeleft = Math.max( Math.floor(state.clock.black_time.thinking_time - black_offset), 0);
            let white_timeleft = Math.max( Math.floor(state.clock.white_time.thinking_time - white_offset), 0);

            if (KGSTIME) {
                this.command("kgs-time_settings absolute " + state.time_control.total_time);
            } else {
                this.command("time_settings " + state.time_control.total_time + " 0 0");
            }
            this.command("time_left black " + black_timeleft + " 0");
            this.command("time_left white " + white_timeleft + " 0");
        }
        // OGS doesn't actually send 'none' time control type
        //
        /* else if (state.time_control.system == 'none') {
            if (KGSTIME) {
                this.command("kgs-time_settings none");
            } else {
                // GTP v2 says byoyomi time > 0 and stones = 0 means no time limits
                //
                this.command("time_settings 0 1 0");
            }
        } */
    }
    
    loadState(state, cb, eb) { /* {{{ */
        this.command("boardsize " + state.width);
        this.command("clear_board");
        this.command("komi " + state.komi);
        //this.log(state);

        //this.loadClock(state);

        let have_initial_state = false;
        if (state.initial_state) {
            let black = decodeMoves(state.initial_state.black, state.width);
            let white = decodeMoves(state.initial_state.white, state.width);
            have_initial_state = (black.length || white.length);

            for (let i=0; i < black.length; ++i)
                    this.command("play black " + move2gtpvertex(black[i], state.width));
            for (let i=0; i < white.length; ++i)
                    this.command("play white " + move2gtpvertex(white[i], state.width));
        }

        // Replay moves made
        let color = state.initial_player;
        let doing_handicap = (!have_initial_state && state.free_handicap_placement && state.handicap > 1);
        let handicap_moves = [];
        let moves = decodeMoves(state.moves, state.width);
        for (let i=0; i < moves.length; ++i) {
            let move = moves[i];
            let c = color
    
            // Use set_free_handicap for handicap stones, play otherwise.
            if (doing_handicap && handicap_moves.length < state.handicap) {
                handicap_moves.push(move);
                if (handicap_moves.length == state.handicap)
                this.sendHandicapMoves(handicap_moves, state.width);
                else continue;  // don't switch color.
            } else {
                this.command("play " + c + ' ' + move2gtpvertex(move, state.width))
            }

            color = color == 'black' ? 'white' : 'black';
        }
        // This breaks PhoenixGo.
        //this.command("showboard", cb, eb);
    } /* }}} */
    
    command(str, cb, eb, final_command) { /* {{{ */
        this.command_callbacks.push(cb);
        if (DEBUG) {
            this.log(">>>", str);
        }
        try {
            if (argv.json) {
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
                this.proc.stdin.write(str + "\r\n");
            }
        } catch (e) {
            this.log("Failed to send command: ", str);
            this.log(e);
            if (eb) eb(e);
        }
    } /* }}} */
    // TODO: We may want to have a timeout here, in case bot crashes. Set it before this.command, clear it in the callback?
    //
    genmove(state, cb) { /* {{{ */
        // Only relevent with persistent bots. Leave the setting on until we actually have requested a move.
        //
        this.firstmove = false;

        // Do this here so we only do it once, plus if there is a long delay between clock message and move message, we'll
        // subtract that missing time from what we tell the bot.
        //
        this.loadClock(state);

        this.command("genmove " + this.game.my_color,
            (move) => {
                move = typeof(move) == "string" ? move.toLowerCase() : null;
                let resign = move == 'resign';
                let pass = move == 'pass';
                let x=-1, y=-1;
                if (!resign && !pass) {
                    if (move && move[0]) {
                        x = gtpchar2num(move[0]);
                        y = state.width - parseInt(move.substr(1))
                    } else {
                        this.log("genmove failed, resigning");
                        resign = true;
                    }
                }
                cb({'x': x, 'y': y, 'text': move, 'resign': resign, 'pass': pass});
            },
            null,
            true /* final command */
        )
    } /* }}} */
    kill() { /* {{{ */
        this.log("Stopping bot ");
    this.ignore = true;  // Prevent race conditions / inconsistencies. Could be in the middle of genmove ...
    this.command("quit");
    } /* }}} */
    sendMove(move, width, color){
        if (DEBUG) this.log("Calling sendMove with", move2gtpvertex(move, width));
        this.command("play " + color + " " + move2gtpvertex(move, width));
    }
    sendHandicapMoves(moves, width) { /* {{{ */
        let cmd = "set_free_handicap";
        for (let i = 0; i < moves.length; i++)
            cmd += " " + move2gtpvertex(moves[i], width);
        this.command(cmd);
    } /* }}} */
    // Called on game over, in case you need something special.
    //
    gameOver() {
    }
}



/**********/
/** Game **/
/**********/
class Game {
    constructor(conn, game_id) { /* {{{ */
        this.conn = conn;
        this.game_id = game_id;
        this.socket = conn.socket;
        this.state = null;
        this.opponent_evenodd = null;
        this.greeted = false;
        this.connected = true;
        this.bot = null;
        this.my_color = null;
        this.corr_move_pending = false;
        this.processing = false;

        this.log("Connecting to game.");

        // TODO: Command line options to allow undo?
        //
        this.socket.on('game/' + game_id + '/undo_requested', (undodata) => {
            this.log("Undo requested", JSON.stringify(undodata, null, 4));
        });

        this.socket.on('game/' + game_id + '/gamedata', (gamedata) => {
            if (!this.connected) return;

            //this.log("Gamedata:", JSON.stringify(gamedata, null, 4));
    
            let prev_phase = (this.state ? this.state.phase : null);
            this.state = gamedata;
            this.my_color = this.conn.bot_id == this.state.players.black.id ? "black" : "white";
            this.log("gamedata     " + this.header());

            conn.addGameForPlayer(gamedata.game_id, this.getOpponent().id);

            // Only call game over handler if game really just finished.
            // For some reason we get connected to already finished games once in a while ...
            if (gamedata.phase == 'finished' && prev_phase && gamedata.phase != prev_phase)
                this.gameOver();

            // First handicap is just lower komi, more handicaps may change who is even or odd move #s.
            //
            if (this.state.free_handicap_placement && this.state.handicap > 1) {
                //In Chinese, black makes multiple free moves.
                //
                this.opponent_evenodd = this.my_color == "black" ? 0 : 1;
                this.opponent_evenodd = (this.opponent_evenodd + this.state.handicap - 1) % 2;
            } else if (this.state.handicap > 1) {
                // In Japanese, white makes the first move.
                //
                this.opponent_evenodd = this.my_color == "black" ? 1 : 0;
            } else {
                // If the game has a handicap, it can't be a fork and the above code works fine.
                // If the game has no handicap, it's either a normal game or a fork. Forks may have reversed turn ordering.
                //
                if (this.state.clock.current_player == this.conn.bot_id) {
                    this.opponent_evenodd = this.state.moves.length % 2;
                } else {
                    this.opponent_evenodd = (this.state.moves.length + 1) % 2;
                }
            }

            // If server has issues it might send us a new gamedata packet and not a move event. We could try to
            // check if we're missing a move and send it to bot out of gamedata. For now as a safe fallback just
            // restart the bot by killing it here if another gamedata comes in. There normally should only be one
            // before we process any moves, and makeMove() is where a new Bot is created.
            //
            if (this.bot) {
                this.log("Killing bot because of gamedata packet after bot was started");
                this.bot.kill();
                this.bot = null;

                if (this.processing) {
                    this.processing = false;
                    --moves_processing;
                    if (argv.corrqueue && this.state.time_control.speed == "correspondence") {
                        --corr_moves_processing;
                    }
                }
            }

            // active_game isn't handling this for us any more. If it is our move, call makeMove.
            //
            if (this.state.phase == "play" && this.state.clock.current_player == this.conn.bot_id) {
                if (argv.corrqueue && this.state.time_control.speed == "correspondence" && corr_moves_processing > 0) {
                    this.corr_move_pending = true;
                } else {
                    this.makeMove(this.state.moves.length);
                }
            }
        });

        this.socket.on('game/' + game_id + '/clock', (clock) => {
            if (!this.connected) return;
            if (DEBUG) this.log("clock:", JSON.stringify(clock));

            if ((argv.nopause || (argv.nopauseranked && this.state.ranked) || (argv.nopauseunranked && this.state.ranked == false))
                && clock.pause && clock.pause.paused && clock.pause.pause_control
                && !clock.pause.pause_control["stone-removal"] && !clock.pause.pause_control.system && !clock.pause.pause_control.weekend
                && !clock.pause.pause_control["vacation-" + clock.black_player_id] && !clock.pause.pause_control["vacation-" + clock.white_player_id]) {
                if (DEBUG) this.log("Pausing not allowed. Resuming game.");
                this.resumeGame();
            }

            //this.log("Clock: ", JSON.stringify(clock));
            if (this.state) {
                this.state.clock = clock;
            } else {
                if (DEBUG) console.error("Received clock for " + this.game_id + "but no state exists");
            }

            // Bot only needs updated clock info right before a genmove, and extra communcation would interfere with Leela pondering.
            //if (this.bot) {
            //    this.bot.loadClock(this.state);
            //}
        });
        this.socket.on('game/' + game_id + '/phase', (phase) => {
            if (!this.connected) return;
            this.log("phase", phase)

            //this.log("Move: ", move);
            if (this.state) {
                this.state.phase = phase;
            } else {
                if (DEBUG) console.error("Received phase for " + this.game_id + "but no state exists");
            }

            if (phase == 'play') {
                /* FIXME: This is pretty stupid.. we know what state we're in to
                 * see if it's our move or not, but it's late and blindly sending
                 * this out works as the server will reject bad moves */
                this.log("Game play resumed, sending pass because we're too lazy to check the state right now to see what we should do");
                this.socket.emit('game/move', this.auth({
                    'game_id': this.state.game_id,
                    'move': '..'
                }));
            }
        });
        this.socket.on('game/' + game_id + '/move', (move) => {
            if (!this.connected) return;
            if (DEBUG) this.log("game/" + game_id + "/move:", move);
            try {
                this.state.moves.push(move.move);

                // Log opponent moves
                let m = decodeMoves(move.move, this.state.width)[0];
                if ((this.my_color == "white" && (this.state.handicap) >= this.state.moves.length) ||
                    move.move_number % 2 == this.opponent_evenodd)
                    this.log("Got     " + move2gtpvertex(m, this.state.width));
            } catch (e) {
                console.error(e)
            }

            // If we're in free placement handicap phase of the game, make extra moves or wait it out, as appropriate.
            //
            // If handicap == 1, no extra stones are played.
            // If we are black, we played after initial gamedata and so handicap is not < length.
            // If we are white, this.state.moves.length will be 1 and handicap is not < length.
            //
            // If handicap >= 1, we don't check for opponent_evenodd to move on our turns until handicaps are finished.
            //
            if (this.state.free_handicap_placement && (this.state.handicap) > this.state.moves.length) {
                if (this.my_color == "black") {
                    // If we are black, we make extra moves.
                    //
                    this.makeMove(this.state.moves.length);
                } else {
                    // If we are white, we wait for opponent to make extra moves.
                    if (this.bot) this.bot.sendMove(decodeMoves(move.move, this.state.width)[0], this.state.width, this.my_color == "black" ? "white" : "black");
                    if (DEBUG) this.log("Waiting for opponent to finish", this.state.handicap - this.state.moves.length, "more handicap moves");
                }
            } else {
                if (move.move_number % 2 == this.opponent_evenodd) {
                    // We just got a move from the opponent, so we can move immediately.
                    //
                    if (this.bot) {
                        this.bot.sendMove(decodeMoves(move.move, this.state.width)[0], this.state.width, this.my_color == "black" ? "white" : "black");
                    }

                    if (argv.corrqueue && this.state.time_control.speed == "correspondence" && corr_moves_processing > 0) {
                        this.corr_move_pending = true;
                    } else {
                        this.makeMove(this.state.moves.length);
                    }
                    //this.makeMove(this.state.moves.length);
                } else {
                    if (DEBUG) this.log("Ignoring our own move", move.move_number);
                }
            }
        });

        this.socket.emit('game/connect', this.auth({
            'game_id': game_id
        }));
    } /* }}} */
    makeMove(move_number) { /* {{{ */
        if (DEBUG && this.state) { this.log("makeMove", move_number, "is", this.state.moves.length, "!=", move_number, "?"); }
        if (!this.state || this.state.moves.length != move_number) {
            return;
        }
        if (this.state.phase != 'play') {
            return;
        }

        ++moves_processing;
        this.processing = true;
        if (argv.corrqueue && this.state.time_control.speed == "correspondence") {
            ++corr_moves_processing;
        }

        let passed = false;
        let passAndRestart = () => {
            if (!passed) {
                passed = true;
                this.log("Bot process crashed, state was");
                this.log(this.state);
                this.socket.emit('game/move', this.auth({
                    'game_id': this.state.game_id,
                    'move': ".."
                }));
                this.procesing = false;
                --moves_processing;
                if (argv.corrqueue && this.state.time_control.speed == "correspondence") {
                   this.corr_move_pending = false;
                    --corr_moves_processing;
                }
                if (this.bot) this.bot.kill();
                this.bot = null;
            }
        }

        if (!this.bot) {
            this.bot = new Bot(this.conn, this, bot_command);
            this.log("Starting new bot process [" + this.bot.proc.pid + "]");

            this.log("State loading for new bot");
            this.bot.loadState(this.state, () => {
                if (DEBUG) {
                    this.log("State loaded for new bot");
                }
            }, passAndRestart);
        }

        if (DEBUG) this.bot.log("Generating move for game", this.game_id);
        this.log("genmove " + (this.my_color == "black" ? "b" : "w"));

        this.bot.genmove(this.state, (move) => {
            this.processing = false;
            --moves_processing;
            if (argv.corrqueue && this.state.time_control.speed == "correspondence") {
                this.corr_move_pending = false;
                --corr_moves_processing;
            }
            if (move.resign) {
                this.log("Resigning");
                this.socket.emit('game/resign', this.auth({
                    'game_id': this.state.game_id
                }));
            }
            else {
                if (DEBUG) this.log("Playing " + move.text, move);
                else       this.log("Playing " + move.text);
                this.socket.emit('game/move', this.auth({
                    'game_id': this.state.game_id,
                    'move': encodeMove(move)
                }));
                //this.sendChat("Test chat message, my move #" + move_number + " is: " + move.text, move_number, "malkovich");
        if( argv.greeting && !this.greeted && this.state.moves.length < (2 + this.state.handicap) ){
                  this.sendChat( GREETING, "discussion");
                  this.greeted = true;
        }
            }
            if (!PERSIST && this.bot != null) {
                this.bot.kill();
                this.bot = null;
            }
        }, passAndRestart);
    } /* }}} */
    auth(obj) { /* {{{ */
        return this.conn.auth(obj);
    }; /* }}} */
    disconnect() { /* {{{ */
        conn.removeGameForPlayer(this.game_id);

        if (this.processing) {
            this.processing = false;
            --moves_processing;
            if (argv.corrqueue && this.state.time_control.speed == "correspondence") {
                --corr_moves_processing;
            }
        }

        if (this.bot)   {
            this.bot.kill();
            this.bot = null;
        }

        this.log("Disconnecting from game.");
        this.connected = false;
        this.socket.emit('game/disconnect', this.auth({
            'game_id': this.game_id
        }));
    }; /* }}} */
    gameOver() /* {{{ */
    {
        if (argv.farewell && this.state && this.state.game_id)
            this.sendChat(FAREWELL, "discussion");

        // Display result
        let s = this.state;
        let col = (s.winner == s.players.black.id ? 'B' : 'W' );
        let res = s.outcome;   res = res[0].toUpperCase() + res.substr(1);
        let m = s.outcome.match(/(.*) points/);
        if (m)  res = m[1];
        if (res == 'Resignation')  res = 'R';
        if (res == 'Cancellation') res = 'Can';
        if (res == 'Timeout')      res = 'Time';
        let winloss = (s.winner == this.conn.bot_id ? "W" : "   L");
        this.log(sprintf("Game over.   Result: %s+%-5s  %s", col, res, winloss));

        if (this.bot) {
            this.bot.gameOver();
            this.bot.kill();
            this.bot = null;
        }
    } /* }}} */
    header() { /* {{{ */
        if (!this.state)  return;
        let color = 'W  ';  // Playing white against ...
        let player = this.state.players.black;
        if (player.username == argv.username) {
            player = this.state.players.white;
            color = '  B';
        }
        let name = player.username;
        let handi = (this.state && this.state.handicap ? "H" + this.state.handicap : "  ");
        return sprintf("%s %s  [%ix%i]  %s", color, name, this.state.width, this.state.width, handi);

        // XXX doesn't work, getting garbage ranks here ...
        // let rank = rank2str(player.rank);
    } /* }}} */
    log(str) { /* {{{ */
        let moves = (this.state && this.state.moves ? this.state.moves.length : 0);
        let movestr = (moves ? sprintf("Move %-3i", moves) : "        ");
        let arr = [ sprintf("[Game %i]  %s ", this.game_id, movestr) ];

        for (let i=0; i < arguments.length; ++i)
            arr.push(arguments[i]);

        console.log.apply(null, arr);
    } /* }}} */
    sendChat(str, move_number, type = "discussion") {
        if (!this.connected) return;

        this.socket.emit('game/chat', this.auth({
            'game_id': this.state.game_id,
            'player_id': this.conn.user_id,
            'body': str,
            'move_number': move_number,
            'type': type,
            'username': argv.username
        }));
    }
    resumeGame() {
        this.socket.emit('game/resume', this.auth({
            'game_id': this.state.game_id,
            'player_id': this.conn.bot_id
        }));
    }    
    getOpponent() {
        let player = this.state.players.white;
        if (player.id == this.conn.bot_id)
            player = this.state.players.black;
        return player;
    }
}



/****************/
/** Connection **/
/****************/
let ignorable_notifications = {
    'gameStarted': true,
    'gameEnded': true,
    'gameDeclined': true,
    'gameResumedFromStoneRemoval': true,
    'tournamentStarted': true,
    'tournamentEnded': true,
};

class Connection {
    constructor() {{{
        let prefix = (argv.insecure ? 'http://' : 'https://') + argv.host + ':' + argv.port;

        conn_log(`Connecting to ${prefix}`);
        let socket = this.socket = io(prefix, {
            reconection: true,
            reconnectionDelay: 500,
            reconnectionDelayMax: 60000,
            transports: ['websocket'],
        });

        this.connected_games = {};
        this.connected_game_timeouts = {};
        this.games_by_player = {};     // Keep track of active games per player
        this.connected = false;

        setTimeout(()=>{
            if (!this.connected) {
                console.error(`Failed to connect to ${prefix}`);
                process.exit(-1);
            }
        }, (/online-go.com$/.test(argv.host)) ? 5000 : 500);


        this.clock_drift = 0;
        this.network_latency = 0;
        setInterval(this.ping.bind(this), 10000);
        socket.on('net/pong', this.handlePong.bind(this));

        socket.on('connect', () => {
            this.connected = true;
            conn_log("Connected");
            this.ping();

            socket.emit('bot/id', {'id': argv.username}, (obj) => {
                this.bot_id = obj.id;
                this.jwt = obj.jwt;
                if (!this.bot_id) {
                    console.error("ERROR: Bot account is unknown to the system: " +   argv.username);
                    process.exit();
                }
                conn_log("Bot is user id:", this.bot_id);
                socket.emit('authenticate', this.auth({}))
                socket.emit('notification/connect', this.auth({}), (x) => {
                    conn_log(x);
                })
                socket.emit('bot/connect', this.auth({ }));
                socket.emit('bot/hidden', !!argv.hidden);
            });
        });

        if (argv.corrqueue) {
            // Check every so often if we have correspondence games that need moves
            //
            setInterval(() => {
                // If a game needs a move and we aren't already working on one, make a move
                //
                if (corr_moves_processing == 0) {
                    // Choose a corr game to make a move
                    // TODO: Choose the game with least time remaining
                    //
                    for (let game_id in this.connected_games) {
                        if (this.connected_games[game_id].corr_move_pending) {
                            this.connected_games[game_id].makeMove(this.state.moves.length);
                            break;
                        }
                    }
                }
            }, 10000);
        }

        setInterval(() => {
            /* if we're sitting there bored, make sure we don't have any move
             * notifications that got lost in the shuffle... and maybe someday
             * we'll get it figured out how this happens in the first place. */
            if (moves_processing == 0) {
                socket.emit('notification/connect', this.auth({}), (x) => {
                    conn_log(x);
                })
            }
        }, 10000);
        socket.on('event', (data) => {
            this.verbose(data);
        });
        socket.on('disconnect', () => {
            this.connected = false;

            conn_log("Disconnected from server");
            if (argv.timeout)
            {
                for (let game_id in this.connected_game_timeouts)
                {
                    if (DEBUG) conn_log("clearTimeout because disconnect from server", game_id);
                    clearTimeout(this.connected_game_timeouts[game_id]);
                }
            }

            for (let game_id in this.connected_games) {
                this.disconnectFromGame(game_id);
            }
        });

        socket.on('notification', (notification) => {
            if (this['on_' + notification.type]) {
                this['on_' + notification.type](notification);
            }
            else if (!(notification.type in ignorable_notifications)) {
                console.log("Unhandled notification type: ", notification.type, notification);
                this.deleteNotification(notification);
            }
        });

        socket.on('active_game', (gamedata) => {
            if (DEBUG) conn_log("active_game:", JSON.stringify(gamedata));

            // OGS auto scores bot games now, no removal processing is needed by the bot.
            //
            // Eventually might want OGS to not auto score, or make it bot-optional to enforce.
            // Some bots can handle stone removal process.
            //
            /* if (gamedata.phase == 'stone removal'
                && ((!gamedata.black.accepted && gamedata.black.id == this.bot_id)
                ||  (!gamedata.white.accepted && gamedata.white.id == this.bot_id))
               ) {
                this.processMove(gamedata);
            } */

            // Don't connect to old finished games.
            if (gamedata.phase == "finished" && !(gamedata.id in this.connected_games))
                return;

            // Set up the game so it can listen for events.
            //
            let game = this.connectToGame(gamedata.id);

            if (gamedata.phase == "play" && gamedata.player_to_move == this.bot_id) {
                // Going to make moves based on gamedata or moves coming in for now on, instead of active_game updates
                // game.makeMove(gamedata.move_number);

                if (argv.timeout)
                {
                    if (this.connected_game_timeouts[gamedata.id]) {
                        clearTimeout(this.connected_game_timeouts[gamedata.id])
                    }
                    if (DEBUG) conn_log("Setting timeout for", gamedata.id);
                    this.connected_game_timeouts[gamedata.id] = setTimeout(() => {
                        if (DEBUG) conn_log("TimeOut activated to disconnect from", gamedata.id);
                        this.disconnectFromGame(gamedata.id);
                    }, argv.timeout); /* forget about game after --timeout seconds */
                }
            }

            // When a game ends, we don't get a "finished" active_game.phase. Probably since the game is no
            // longer active.(Update: We do get finished active_game events? Unclear why I added prior note.)
            //
            if (gamedata.phase == "finished") {
                if (DEBUG) conn_log(gamedata.id, "gamedata.phase == finished");

                // XXX We want to disconnect right away here, but there's a game over race condition
                //     on server side: sometimes /gamedata event with game outcome is sent after
                //     active_game, so it's lost since there's no game to handle it anymore...
                //     Work around it with a timeout for now.
                setTimeout(() => {  this.disconnectFromGame(gamedata.id);  }, 1000);
            } else {
                if (argv.timeout)
                {
                    if (this.connected_game_timeouts[gamedata.id]) {
                        clearTimeout(this.connected_game_timeouts[gamedata.id])
                    }
                    if (DEBUG) conn_log("Setting timeout for", gamedata.id);
                    this.connected_game_timeouts[gamedata.id] = setTimeout(() => {
                        this.disconnectFromGame(gamedata.id);
                    }, argv.timeout); /* forget about game after --timeout seconds */
                }
            }
        });
    }}}
    auth(obj) { /* {{{ */
        obj.apikey = argv.apikey;
        obj.bot_id = this.bot_id;
        obj.player_id = this.bot_id;
        if (this.jwt) {
            obj.jwt = this.jwt;
        }
        return obj;
    } /* }}} */
    connectToGame(game_id) { /* {{{ */
        if (argv.timeout)
        {
            if (game_id in this.connected_games) {
                clearTimeout(this.connected_game_timeouts[game_id])
            }
            this.connected_game_timeouts[game_id] = setTimeout(() => {
                this.disconnectFromGame(game_id);
            }, argv.timeout); /* forget about game after --timeout seconds */
        }

        if (game_id in this.connected_games) {
            if (DEBUG) conn_log("Connected to game", game_id, "already");
            return this.connected_games[game_id];
        }

        return this.connected_games[game_id] = new Game(this, game_id);;
    }; /* }}} */
    disconnectFromGame(game_id) { /* {{{ */
        if (DEBUG) {
            conn_log("disconnectFromGame", game_id);
        }
        if (argv.timeout)
        {
            if (game_id in this.connected_game_timeouts)
            {
                if (DEBUG) conn_log("clearTimeout in disconnectFromGame", game_id);
                clearTimeout(this.connected_game_timeouts[game_id]);
            }
        }
        if (game_id in this.connected_games) {
            this.connected_games[game_id].disconnect();
            delete this.connected_games[game_id];
            delete this.connected_game_timeouts[game_id];
        }

        // TODO Following 2 lines seem duplicate of above? Safe to remove?
        delete this.connected_games[game_id];
        if (argv.timeout) delete this.connected_game_timeouts[game_id];
    }; /* }}} */
    deleteNotification(notification) { /* {{{ */
        this.socket.emit('notification/delete', this.auth({notification_id: notification.id}), (x) => {
            conn_log("Deleted notification ", notification.id);
        });
    }; /* }}} */
    connection_reset() { /* {{{ */
        for (let game_id in this.connected_games) {
            this.disconnectFromGame(game_id);
        }
        if (this.socket) this.socket.emit('notification/connect', this.auth({}), (x) => {
            conn_log(x);
        });
    }; /* }}} */
    on_friendRequest(notification) { /* {{{ */
        console.log("Friend request from ", notification.user.username);
        post(api1("me/friends/invitations"), this.auth({ 'from_user': notification.user.id }))
        .then((obj)=> conn_log(obj.body))
        .catch(conn_log);
    }; /* }}} */
    // Check game settings are acceptable
    //
    checkGameSettings(notification) { /* {{{ */
        let t = notification.time_control;
        let user = notification.user;

        // Sanity check, user can't choose rules. Bots only play chinese.
        if (["chinese"].indexOf(notification.rules) < 0) {
            conn_log("Unhandled rules: " + notification.rules + ", rejecting challenge");
            return { reject: true, msg: "Unhandled rules: " + notification.rules + ". " };
        }

        if (notification.width != notification.height) {
            conn_log("board was not square, rejecting challenge");
            return { reject: true, msg: "Board was not square. " };
        }

        if(!allowed_sizes[notification.width]) {
            conn_log("board width " + notification.width + " not an allowed size, rejecting challenge");
            return { reject: true, msg: "Board width " + notification.width + " not an allowed size. " };
        }

        if(!allowed_komi[notification.komi]) {
            conn_log("komi value " + notification.komi + " is not an allowed komi, allowed komi are" + argv.komi + ", rejecting challenge");
            return { reject: true, msg: "Komi " + notification.komi + " is different from " + argv.komi + " : komi value not allowed, please note that the automatic komi is called null. "};
        }

        if (!allowed_speeds[t.speed]) {
            conn_log(user.username + " wanted speed " + t.speed + ", not in: " + argv.speed);
            return { reject: true, msg: "Allowed speeds are: " + argv.speed + ". " };
        }

        if (!allowed_timecontrols[t.time_control]) {
            conn_log(user.username + " wanted time control " + t.time_control + ", not in: " + argv.timecontrol);
            return { reject: true, msg: "Allowed time controls: " + argv.timecontrol + ". " };
        }

        if (argv.minmaintime) {
            if ( ["simple","none"].indexOf(t.time_control) >= 0) {
                conn_log("Minimum main time not supported in time control: " + t.time_control);
                return { reject: true, msg: "Minimum main time not supported in time control " + t.time_control + ". " };
            }
            if (t.total_time   < argv.minmaintime  || // absolute
                t.initial_time < argv.minmaintime  || // fischer
                t.max_time     < argv.minmaintime  || // fischer
                t.main_time    < argv.minmaintime) {  // others
                    conn_log(user.username + " wanted main time below minmaintime " + argv.minmaintime);
                    return { reject: true, msg: "Minimum main time is (" + argv.minmaintime + "). " };
                }
        }

        if (argv.maxmaintime) {
            if (["simple","none"].indexOf(t.time_control) >= 0) {
                conn_log("Maximum main time not supported in time control: " + t.time_control);
                return { reject: true, msg: "Maximum main time not supported in time control " + t.time_control + ". " };
            }
            if (t.total_time   > argv.maxmaintime  || // absolute
                t.initial_time > argv.maxmaintime  || // fischer
                t.max_time     > argv.maxmaintime  || // fischer
                t.main_time    > argv.maxmaintime) {  // others
                conn_log(user.username + " wanted main time above maxmaintime " + argv.maxmaintime);
                return { reject: true, msg: "Maximum main time is (" + argv.maxmaintime + "). " };
            }
        }

        if (argv.minperiodtime &&
            (      (t.period_time    < argv.minperiodtime)
                || (t.time_increment < argv.minperiodtime)
                || (t.per_move       < argv.minperiodtime)
                || ((t.period_time / t.stones_per_period) < argv.minperiodtime)
            ))
        {
            conn_log(user.username + " wanted period too short");
            return { reject: true, msg: "Minimum period length (per stone in period) is " + argv.minperiodtime + ". " };
        }

        if (argv.maxperiodtime &&
            (      (t.period_time    > argv.maxperiodtime)
                || (t.time_increment > argv.maxperiodtime)
                || (t.per_move       > argv.maxperiodtime)
                || ((t.period_time / t.stones_per_period) > argv.maxperiodtime)
            ))
        {
            conn_log(user.username + " wanted period too long");
            return { reject: true, msg: "Maximum period length (per stone in period) is " + argv.maxperiodtime + ". " };
        }

        if (argv.minperiods && (t.periods < argv.minperiods)) {
            conn_log(user.username + " wanted too few periods: " + t.periods);
            return { reject: true, msg: "Minimum # of periods is " + argv.minperiods + ". " };
        }

        if (argv.minperiodsranked && notification.ranked && (t.periods < argv.minperiodsranked)) {
            conn_log(user.username + " wanted too few ranked periods: " + t.periods);
            return { reject: true, msg: "Minimum # of ranked periods is " + argv.minperiodsranked + ". " };
        }

        if (argv.minperiodsunranked && !notification.ranked && (t.periods < argv.minperiodsunranked)) {
            conn_log(user.username + " wanted too few unranked periods: " + t.periods);
            return { reject: true, msg: "Minimum # of unranked periods is " + argv.minperiodsunranked + ". " };
        }

        if (t.periods > argv.maxperiods) {
            conn_log(user.username + " wanted too many periods: " + t.periods);
            return { reject: true, msg: "Maximum # of periods is " + argv.maxperiods + ". " };
        }

        if (notification.ranked && t.periods > argv.maxperiodsranked) {
            conn_log(user.username + " wanted too many ranked periods: " + t.periods);
            return { reject: true, msg: "Maximum # of periods is " + argv.maxperiodsranked + ". " };
        }

        if (!notification.ranked && t.periods > argv.maxperiodsunranked) {
            conn_log(user.username + " wanted too many unranked periods: " + t.periods);
            return { reject: true, msg: "Maximum # of periods is " + argv.maxperiodsunranked + ". " };
        }

        if (argv.rankedonly && !notification.ranked) {
            conn_log("Ranked games only");
            return { reject: true, msg: "Ranked games only. " };
        }

        if (argv.unrankedonly && notification.ranked) {
            conn_log("Unranked games only");
            return { reject: true, msg: "Unranked games only. " };
        }

        if (notification.handicap < argv.minhandicap) {
            conn_log("Min handicap is " + argv.minhandicap);
            return { reject: true, msg: "Min handicap is " + argv.minhandicap + ". " };
        }

        if (notification.handicap > argv.maxhandicap) {
            conn_log("Max handicap is " + argv.maxhandicap);
            return { reject: true, msg: "Max handicap is " + argv.maxhandicap + ". " };
        }

        if (notification.ranked && notification.handicap < argv.minrankedhandicap) {
            conn_log("Min ranked handicap is " + argv.minrankedhandicap);
            return { reject: true, msg: "Min ranked handicap is " + argv.minrankedhandicap + ". " };
        }

        if (notification.ranked && notification.handicap > argv.maxrankedhandicap) {
            conn_log("Max ranked handicap is " + argv.maxrankedhandicap);
            return { reject: true, msg: "Max ranked handicap is " + argv.maxrankedhandicap + ". " };
        }

        if (!notification.ranked && notification.handicap < argv.minunrankedhandicap) {
            conn_log("Min unranked handicap is " + argv.minunrankedhandicap);
            return { reject: true, msg: "Min unranked handicap is " + argv.minunrankedhandicap + ". " };
        }

        if (!notification.ranked && notification.handicap > argv.maxunrankedhandicap) {
            conn_log("Max unranked handicap is " + argv.maxunrankedhandicap);
            return { reject: true, msg: "Max unranked handicap is " + argv.maxunrankedhandicap + ". " };
        }

        return { reject: false };  // Ok !

    } /* }}} */
    // Check user is acceptable
    //
    checkUser(notification) { /* {{{ */
        let user = notification.user;

        if (banned_users[user.username] || banned_users[user.id]) {
            conn_log(user.username + " (" + user.id + ") is banned, rejecting challenge");
            return { reject: true };
        } else if (notification.ranked && (banned_ranked_users[user.username] || banned_ranked_users[user.id])) {
            conn_log(user.username + " (" + user.id + ") is banned from ranked, rejecting challenge");
            return { reject: true };
        } else if (!notification.ranked && (banned_unranked_users[user.username] || banned_unranked_users[user.id])) {
            conn_log(user.username + " (" + user.id + ") is banned from unranked, rejecting challenge");
            return { reject: true };
        }

        if (user.ranking < argv.minrank) {
            conn_log(user.username + " ranking too low: " + user.ranking);
            return { reject: true, msg: "Your ranking is too low. " };
        }

        if (user.ranking > argv.maxrank) {
            conn_log(user.username + " ranking too high: " + user.ranking);
            return { reject: true, msg: "Your ranking is too high. " };
        }

        if (argv.proonly && !user.professional) {
            conn_log(user.username + " is not a professional");
            return { reject: true, msg: "Games vs professionals only. " };
        }

        let active_games = conn.gamesForPlayer(notification.user.id);
        if (argv.maxactivegames && active_games >= argv.maxactivegames) {
            conn_log("Too many active games.");
            return { reject: true, msg: "Too many active games." };
        }

        if (this.connected_games) {
            this.log("# of connected games = " + this.connected_games.length");
        } else {
            this.log("There are no connected games");
        }

        if (argv.maxtotalgames && this.connected_games && this.connected_games.length >= argv.maxtotalgames){
            conn_log("Too many total games.");
            return { reject: true, msg: "Too many total games." };
        }

        return { reject: false };

    } /* }}} */
    // Check everything and return reject status + optional error msg.
    //
    checkChallenge(notification) { /* {{{ */
        if (check_rejectnew()) {
            conn_log("Not accepting new games (rejectnew).");
            return { reject: true, msg: "Not accepting new games at this time. " };
        }

        let c = this.checkGameSettings(notification);
        if (c.reject)  return c;

        c = this.checkUser(notification);
        if (c.reject)  return c;

        return { reject: false };  /* All good. */

    } /* }}} */
    on_challenge(notification) { /* {{{ */
        let c = this.checkChallenge(notification);
        let rejectmsg = (c.msg ? c.msg : "");

        let handi = (notification.handicap > 0 ? "H" + notification.handicap : "");
        let accepting = (c.reject ? "Rejecting" : "Accepting");
        conn_log(sprintf("%s challenge from %s (%s)  [%ix%i] %s id = %i",
                         accepting, notification.user.username, rank2str(notification.user.ranking),
                         notification.width, notification.width,
                         handi, notification.game_id));

        if (!c.reject) {
            post(api1('me/challenges/' + notification.challenge_id+'/accept'), this.auth({ }))
            .then(ignore)
            .catch((err) => {
                conn_log("Error accepting challenge, declining it");
                post(api1('me/challenges/' + notification.challenge_id), this.auth({ 
                    'delete': true,
                    'message': 'Error accepting game challenge, challenge has been removed.',
                }))
                .then(ignore)
                .catch(conn_log)
                this.deleteNotification(notification);
            })
        } else {
            post(api1('me/challenges/' + notification.challenge_id), this.auth({
                'delete': true,
                'message': rejectmsg || "The AI you've challenged has rejected this game.",
            }))
            .then(ignore)
            .catch(conn_log)
        }
    }; /* }}} */
    processMove(gamedata) { /* {{{ */
        let game = this.connectToGame(gamedata.id)
        game.makeMove(gamedata.move_number);
    }; /* }}} */
    processStoneRemoval(gamedata) { /* {{{ */
        return this.processMove(gamedata);
    }; /* }}} */
    on_delete(notification) { /* {{{ */
        /* don't care about delete notifications */
    }; /* }}} */
    on_gameStarted(notification) { /* {{{ */
        /* don't care about gameStarted notifications */
    }; /* }}} */
    addGameForPlayer(game_id, player) { /* {{{ */
        if (!this.games_by_player[player]) {
            this.games_by_player[player] = [ game_id ];
            return;
        }
        if (this.games_by_player[player].indexOf(game_id) != -1)  // Already have it ?
            return;
        this.games_by_player[player].push(game_id);
    } /* }}} */
    removeGameForPlayer(game_id) { /* {{{ */
        for (let player in this.games_by_player) {
            let idx = this.games_by_player[player].indexOf(game_id);
            if (idx == -1)  continue;

            this.games_by_player[player].splice(idx, 1);  // Remove element
            if (this.games_by_player[player].length == 0)
                delete this.games_by_player[player];
            return;
        }
    } /* }}} */
    gamesForPlayer(player) { /* {{{ */
        if (!this.games_by_player[player])  return 0;
        return this.games_by_player[player].length;
    } /* }}} */
    ok (str) {{{
        conn_log(str); 
    }}}
    err (str) {{{
        conn_log("ERROR: ", str); 
    }}}
    ping() {{{
        this.socket.emit('net/ping', {client: (new Date()).getTime()});
    }}}
    handlePong(data) {{{
        let now = Date.now();
        let latency = now - data.client;
        let drift = ((now-latency/2) - data.server);
        this.network_latency = latency;
        this.clock_drift = drift;
    }}}
}


/**********/
/** Util **/
/**********/
function ignore() {}
function api1(str) { return "/api/v1/" + str; }
function post(path, data, cb, eb) { return request("POST", argv.host, argv.port, path, data, cb, eb); }
function get(path, data, cb, eb) { return request("GET", argv.host, argv.port, path, data, cb, eb); }
function put(path, data, cb, eb) { return request("PUT", argv.host, argv.port, path, data, cb, eb); }
function del(path, data, cb, eb) { return request("DELETE", argv.host, argv.port, path, data, cb, eb); }
function request(method, host, port, path, data) { /* {{{ */
    return new Promise((resolve, reject) => {
        if (DEBUG) {
            console.debug(method, host, port, path, data);
        }

        let enc_data_type = "application/x-www-form-urlencoded";
        for (let k in data) {
            if (typeof(data[k]) == "object") {
                enc_data_type = "application/json";
            }
        }

        let headers = null;
        if (data._headers) {
            data = dup(data)
            headers = data._headers;
            delete data._headers;
        }

        let enc_data = null;
        if (enc_data_type == "application/json") {
            enc_data = JSON.stringify(data);
        } else {
            enc_data = querystring.stringify(data);
        }

        let options = {
            host: host,
            port: port,
            path: path,
            method: method,
            headers: {
                'Content-Type': enc_data_type,
                'Content-Length': enc_data.length
            }
        };
        if (headers) {
            for (let k in headers) {
                options.headers[k] = headers[k];
            }
        }

        let req = (argv.insecure ? http : https).request(options, (res) => {
            res.setEncoding('utf8');
            let body = "";
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode > 299) {
                    reject({'error': `${res.statusCode} - ${body}`, 'response': res, 'body': body})
                    return;
                }
                resolve({'response': res, 'body': body});
            });
        });
        req.on('error', (e) => {
            reject({'error': e.message})
        });

        req.write(enc_data);
        req.end();
    });
} /* }}} */

function decodeMoves(move_obj, board_size) { /* {{{ */
    let ret = [];
    let width = board_size;
    let height = board_size;

    /*
    if (DEBUG) {
        console.log("Decoding ", move_obj);
    }
    */

    let decodeSingleMoveArray = (arr) => {
        let obj = {
            x         : arr[0],
            y         : arr[1],
            timedelta : arr.length > 2 ? arr[2] : -1,
            color     : arr.length > 3 ? arr[3] : 0,
        }
        let extra = arr.length > 4 ? arr[4] : {};
        for (let k in extra) {
            obj[k] = extra[k];
        }
        return obj;
    }

    if (move_obj instanceof Array) {
        if (move_obj.length && typeof(move_obj[0]) == 'number') {
            ret.push(decodeSingleMoveArray(move_obj));
        }
        else {
            for (let i=0; i < move_obj.length; ++i) {
                let mv = move_obj[i];
                if (mv instanceof Array) {
                    ret.push(decodeSingleMoveArray(mv));
                }
                else { 
                    throw new Error("Unrecognized move format: ", mv);
                }
            }
        }
    } 
    else if (typeof(move_obj) == "string") {

        if (/[a-zA-Z][0-9]/.test(move_obj)) {
            /* coordinate form, used from human input. */
            let move_string = move_obj;

            let moves = move_string.split(/([a-zA-Z][0-9]+|[.][.])/);
            for (let i=0; i < moves.length; ++i) {
                if (i%2) { /* even are the 'splits', which should always be blank unless there is an error */
                    let x = pretty_char2num(moves[i][0]);
                    let y = height-parseInt(moves[i].substring(1));
                    if ((width && x >= width) || x < 0) x = y= -1;
                    if ((height && y >= height) || y < 0) x = y = -1;
                    ret.push({"x": x, "y": y, "edited": false, "color": 0});
                } else {
                    if (moves[i] != "") { 
                        throw "Unparsed move input: " + moves[i];
                    }
                }
            }
        } else {
            /* Pure letter encoded form, used for all records */
            let move_string = move_obj;

            for (let i=0; i < move_string.length-1; i += 2) {
                let edited = false;
                let color = 0;
                if (move_string[i+0] == '!') {
                    edited = true;
                    color = parseInt(move_string[i+1]);
                    i += 2;
                }


                let x = char2num(move_string[i]);
                let y = char2num(move_string[i+1]);
                if (width && x >= width) x = y= -1;
                if (height && y >= height) x = y = -1;
                ret.push({"x": x, "y": y, "edited": edited, "color": color});
            }
        }
    } 
    else {
        throw new Error("Invalid move format: ", move_obj);
    }

    return ret;
}; /* }}} */
function char2num(ch) { /* {{{ */
    if (ch == ".") return -1;
    return "abcdefghijklmnopqrstuvwxyz".indexOf(ch);
}; /* }}} */
function pretty_char2num(ch) { /* {{{ */
    if (ch == ".") return -1;
    return "abcdefghjklmnopqrstuvwxyz".indexOf(ch.toLowerCase());
}; /* }}} */
function num2char(num) { /* {{{ */
    if (num == -1) return ".";
    return "abcdefghijklmnopqrstuvwxyz"[num];
}; /* }}} */
function encodeMove(move) { /* {{{ */
    if (move['x'] == -1) 
        return "..";
    return num2char(move['x']) + num2char(move['y']);
} /* }}} */
function move2gtpvertex(move, board_size) { /* {{{ */
    if (move.x < 0) {
        return "pass";
    }
    return num2gtpchar(move['x']) + (board_size-move['y'])
} /* }}} */
function gtpchar2num(ch) { /* {{{ */
    if (ch == "." || !ch)
        return -1;
    return "abcdefghjklmnopqrstuvwxyz".indexOf(ch.toLowerCase());
} /* }}} */
function num2gtpchar(num) { /* {{{ */
    if (num == -1) 
        return ".";
    return "abcdefghjklmnopqrstuvwxyz"[num];
} /* }}} */
function rank2str(r) { /* {{{ */
    r = r.toFixed();
    if (r >= 30)  return (r-30+1) + 'd';
    else          return (30-r) + 'k';
} /* }}} */

function conn_log() { /* {{{ */
    let arr = ["# "];
    let errlog = false;
    for (let i=0; i < arguments.length; ++i) {
        let param = arguments[i];
        if (typeof(param) == 'object' && 'error' in param) {
            errlog = true;
            arr.push(param.error);
        } else {
            arr.push(param);
        }
    }

    if (errlog) {
        console.error.apply(null, arr);
        console.error(new Error().stack);
    } else {
        console.log.apply(null, arr);
    }
} /* }}} */

let conn = new Connection();
