#!/usr/bin/env node

'use strict';

process.title = 'gtp2ogs';
let DEBUG = false;



let spawn = require('child_process').spawn;
let os = require('os')
let io = require('socket.io-client');
let querystring = require('querystring');
let http = require('http');
let https = require('https');
let crypto = require('crypto');
let console = require('tracer').colorConsole({
    format : [
        "{{title}} {{file}}:{{line}}{{space}} {{message}}" //default format
    ],
    preprocess :  function(data){
        switch (data.title) {
            case 'debug': data.title = ' '; break;
            case 'log': data.title = ' '; break;
            case 'info': data.title = ' '; break;
            case 'warn': data.title = '!'; break;
            case 'error': data.title = '!!!!!'; break;
        }
        data.space = " ".repeat(Math.max(0, 30 - `${data.file}:${data.line}`.length));
    }
});


let optimist = require("optimist")
    .usage("Usage: $0 --username <bot-username> --apikey <apikey> command [arguments]")
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
    .describe('timeout', 'Disconnect from a game after this many seconds')
    .default('timeout', 10*60)
    .describe('insecure', "Don't use ssl to connect to the ggs/rest servers [false]")
    .describe('beta', 'Connect to the beta server (sets ggs/rest hosts to the beta server)')
    .describe('debug', 'Output GTP command and responses from your Go engine')
    .describe('json', 'Send and receive GTP commands in a JSON encoded format')
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

if (argv.beta) {
    argv.host = 'beta.online-go.com';
}

if (argv.debug) {
    DEBUG = true;
}

let bot_command = argv._;
let moves_processing = 0;

process.title = 'gtp2ogs ' + bot_command.join(' ');

/*********/
/** Bot **/
/*********/
class Bot {
    constructor(cmd) {{{
        this.proc = spawn(cmd[0], cmd.slice(1));
        this.commands_sent = 0;
        this.command_callbacks = [];

        if (DEBUG) {
            this.log("Starting ", cmd.join(' '));
        }

        this.proc.stderr.on('data', (data) => {
            this.error("stderr: " + data);
        });
        let stdout_buffer = "";
        this.proc.stdout.on('data', (data) => {
            stdout_buffer += data.toString();

            if (argv.json) {
                try {
                    stdout_buffer = JSON.parse(stdout_buffer);
                } catch (e) {
                    // Partial result received, wait until we can parse the result
                    return;
                }
            }

            if (stdout_buffer[stdout_buffer.length-1] != '\n') {
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
		// GTP doesn't support information on number of byoyomi periods remaining as I understand it, just
		// the numebr of stones for Canadian. Bot-specific rules might want to be added by bot admin in how to 
		// work around that. Perhaps add all the period times together as a total time left to keep thinking.
		// Perhaps use Max(timeleft vs byoyomi period) for bots that don't understand byoyomi time controls.
		// Still, bots without time control awareness would play too quickly if it thouoght the period time was
		// the total time left for entire match.
		//
		let black_offset = 0;
		let white_offset = 0;
		
		if (state.clock.current_player == state.clock.black_player_id) {
			black_offset = (state.clock.last_move - Date.now()) / 1000; 
		} else {
			white_offset = (state.clock.last_move - Date.now()) / 1000; 
		}
		
		if (state.time_control.system == 'byoyomi') {
			this.command("time_settings " + state.time_control.main_time + " " 
				+ state.time_control.period_time + " 0");
			this.command("time_left black " + Math.floor(state.clock.black_time.thinking_time + black_offset) + " 0");
			this.command("time_left white " + Math.floor(state.clock.white_time.thinking_time + white_offset) + " 0");
		} else if (state.time_control.system == 'canadian') {
			// Canadian block_time not supported by GTP per se. What to do should maybe be bot specific. For now
			// consider this a placeholder more than anything else. But at least if a human wants Canadian, the bot
			// will try to play within basic time provided (if it even cares about timing out).
			// 
			this.command("time_settings " + state.time_control.main_time + " "
				+ state.time_control.period_time + " " + state.time_control.stones_per_period);
			this.command("time_left black " + Math.floor(state.clock.black_time.thinking_time + black_offset)
				+ " " + state.clock.black_time.moves_left);
			this.command("time_left white " + Math.floor(state.clock.white_time.thinking_time + white_offset) 
				+ " " + state.clock.white_time.moves_left);
		}
	}
    loadState(state, cb, eb) { /* {{{ */
        this.command("boardsize " + state.width);
        this.command("clear_board");
        this.command("komi " + state.komi);

		// this.log(state);
		
		this.loadClock(state);

        if (state.initial_state) {
            let black = decodeMoves(state.initial_state.black, state.width);
            let white = decodeMoves(state.initial_state.white, state.width);

            if (black.length) {
                let s = "";
                for (let i=0; i < black.length; ++i) {
                    s += " " + move2gtpvertex(black[i], state.width);
                }
                this.command("set_free_handicap " + s);
            }

            if (white.length) {
                /* no analagous command for white stones, so we just do moves instead */
                for (let i=0; i < white.length; ++i) {
                    this.command("play white " + move2gtpvertex(white[i], state.width));
                }
            }
        }

        // Replay moves made
        let color = state.initial_player
        let handicaps_left = state.handicap
        let moves = decodeMoves(state.moves, state.width) 
        for (let i=0; i < moves.length; ++i) {
            let move = moves[i];
            let c = color
            if (move.edited) {
                c = move['color']
            }
            this.last_color = c;
            this.command("play " + c + ' ' + move2gtpvertex(move, state.width))
            if (! move.edited) {
                if (state.free_handicap_placement && handicaps_left > 1) {
                    handicaps_left-=1
                } 
                else {
                    color = color == 'black' ? 'white' : 'black';
                }
            }
        }
        this.command("showboard", cb, eb);
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
    genmove(state, cb) { /* {{{ */
        this.command("genmove " + (this.last_color == 'black' ? 'white' : 'black'), 
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
        this.proc.kill();
    } /* }}} */

} /* }}} */



/**********/
/** Game **/
/**********/
class Game {
    constructor(conn, game_id) { /* {{{ */
        this.conn = conn;
        this.game_id = game_id;
        this.socket = conn.socket;
        this.state = null;
        this.waiting_on_gamedata_to_make_move = false;
        this.move_number_were_waiting_for = -1;
        this.connected = true;

        let check_for_move = () => {
			if (!this.state) {
                console.error('Gamedata not received yet for game, but check_for_move has been called');
                return;
            }
            if (this.state.phase == 'play') {
                if (this.waiting_on_gamedata_to_make_move && this.state.moves.length == this.move_number_were_waiting_for) {
                    this.makeMove(this.move_number_were_waiting_for);
                    this.waiting_on_gamedata_to_make_move = false;
                    this.move_number_were_waiting_for = -1;
                }
            }
            else if (this.state.phase == 'finished') {
                this.log("Game is finished");
            }
        }

        this.socket.on('game/' + game_id + '/gamedata', (gamedata) => {
            if (!this.connected) return;
            this.log("gamedata")

            //this.log("Gamedata:", JSON.stringify(gamedata, null, 4));
            this.state = gamedata;
            check_for_move();
        });
        this.socket.on('game/' + game_id + '/clock', (clock) => {
            if (!this.connected) return;
            this.log("clock")

            // this.log("Clock: ", clock);
            this.state.clock = clock;
			if (this.bot) {
				this.bot.loadClock(state);
			}
        });
        this.socket.on('game/' + game_id + '/phase', (phase) => {
            if (!this.connected) return;
            this.log("phase", phase)

            //this.log("Move: ", move);
            this.state.phase = phase;
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
            try {
                this.state.moves.push(move.move);
            } catch (e) {
                console.error(e)
            }
            if (this.bot) {
                this.bot.sendMove(decodeMoves(move.move, this.state.width)[0]);
            }
            check_for_move();
        });

        this.socket.emit('game/connect', this.auth({
            'game_id': game_id
        }));
    } /* }}} */
    makeMove(move_number) { /* {{{ */
        if (!this.state || this.state.moves.length != move_number) {
            this.waiting_on_gamedata_to_make_move = true;
            this.move_number_were_waiting_for = move_number;
            return;
        }
        if (this.state.phase != 'play') {
            return;
        }

        let bot = new Bot(bot_command);
        ++moves_processing;

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
                --moves_processing;
                bot.kill();
            }
        }

        bot.log("Generating move for game ", this.game_id);
        bot.loadState(this.state, () => {
            if (DEBUG) {
                this.log("State loaded");
            }
        }, passAndRestart);

        bot.genmove(this.state, (move) => {
            --moves_processing;
            if (move.resign) {
                this.log("Resigning");
                this.socket.emit('game/resign', this.auth({
                    'game_id': this.state.game_id
                }));
            }
            else {
                this.log("Playing " + move.text, move);
                this.socket.emit('game/move', this.auth({
                    'game_id': this.state.game_id,
                    'move': encodeMove(move)
                }));
                //this.sendChat("Test chat message, my move #" + move_number + " is: " + move.text, move_number, "malkovich");
            }
            bot.kill();
        }, passAndRestart);
    } /* }}} */
    auth(obj) { /* {{{ */
        return this.conn.auth(obj);
    }; /* }}} */
    disconnect() { /* {{{ */
        this.log("Disconnecting");

        this.connected = false;
        this.socket.emit('game/disconnect', this.auth({
            'game_id': this.game_id
        }));
    }; /* }}} */
    log(str) { /* {{{ */
        let arr = ["[Game " + this.game_id + "]"];
        for (let i=0; i < arguments.length; ++i) {
            arr.push(arguments[i]);
        }

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
                socket.emit('bot/connect', this.auth({ }), () => {
                })
            });
        });

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
            conn_log("Disconnected");
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
            if (DEBUG) {
                //conn_log("active_game message:", JSON.stringify(gamedata, null, 4));
            }
            // OGS auto scores bot games now, no removal processing is needed by the bot.
            //
            /* if (gamedata.phase == 'stone removal'
                && ((!gamedata.black.accepted && gamedata.black.id == this.bot_id)
                ||  (!gamedata.white.accepted && gamedata.white.id == this.bot_id))
               ) {
                this.processMove(gamedata);
            } */
            if (gamedata.phase == "play" && gamedata.player_to_move == this.bot_id) {
                this.processMove(gamedata);
            }
            if (gamedata.phase == "finished") {
                this.disconnectFromGame(gamedata.id);
            } else {
                if (this.connected_game_timeouts[gamedata.id]) {
                    clearTimeout(this.connected_game_timeouts[gamedata.id])
                }
                conn_log("Setting timeout for", gamedata.id);
                this.connected_game_timeouts[gamedata.id] = setTimeout(() => {
                    this.disconnectFromGame(gamedata.id);
                }, argv.timeout); /* forget about game after --timeout seconds */
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
        if (DEBUG) {
            conn_log("Connecting to game", game_id);
        }

        if (game_id in this.connected_games) {
            clearTimeout(this.connected_game_timeouts[game_id])
        }
        this.connected_game_timeouts[game_id] = setTimeout(() => {
            this.disconnectFromGame(game_id);
        }, argv.timeout); /* forget about game after --timeout seconds */

        if (game_id in this.connected_games) {
            return this.connected_games[game_id];
        }
        return this.connected_games[game_id] = new Game(this, game_id);;
    }; /* }}} */
    disconnectFromGame(game_id) { /* {{{ */
        if (DEBUG) {
            conn_log("Disconnected from game", game_id);
        }
        if (game_id in this.connected_games) {
            clearTimeout(this.connected_game_timeouts[game_id])
            this.connected_games[game_id].disconnect();
        }

        delete this.connected_games[game_id];
        delete this.connected_game_timeouts[game_id];
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
    }; /* }}} */
    on_friendRequest(notification) { /* {{{ */
        console.log("Friend request from ", notification.user.username);
        post(api1("me/friends/invitations"), this.auth({ 'from_user': notification.user.id }))
        .then((obj)=> conn_log(obj.body))
        .catch(conn_log);
    }; /* }}} */
    on_challenge(notification) { /* {{{ */
        let reject = false;
        if (["japanese", "aga", "chinese", "korean"].indexOf(notification.rules) < 0) {
            conn_log("Unhandled rules: " + notification.rules + ", rejecting challenge");
            reject = true;
        }

        if (notification.width != notification.height) {
            conn_log("board was not square, rejecting challenge");
            reject = true;
        }

        if (!reject) {
            conn_log("Accepting challenge, game_id = "  + notification.game_id);
            post(api1('me/challenges/' + notification.challenge_id+'/accept'), this.auth({ }))
            .then(ignore)
            .catch((err) => {
                conn_log("Error accepting challenge, declining it");
                del(api1('me/challenges/' + notification.challenge_id), this.auth({ }))
                .then(ignore)
                .catch(conn_log)
                this.deleteNotification(notification);
            })
        } else {
            del(api1('me/challenges/' + notification.challenge_id), this.auth({ }))
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
        let now = (new Date()).getTime();
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
