#!/usr/bin/env node

'use strict';

process.title = 'gtp2ogs';
var DEBUG = false;

/**************************/
/** Command line parsing **/ 
/**************************/
var spawn = require('child_process').spawn;
var os = require('os')
var io = require('socket.io-client');
var sys = require('sys')
var querystring = require('querystring');
var http = require('http');
var https = require('https');
var crypto = require('crypto');

var optimist = require("optimist")
    .usage("Usage: $0 --botid <bot-username> --apikey <apikey> command [arguments]")
    .alias('botid', 'bot')
    .alias('botid', 'id')
    .alias('ggs-host', 'ggshost')
    .alias('ggs-port', 'ggsport')
    .alias('rest-host', 'resthost')
    //.alias('concurrency', 'c')
    .alias('debug', 'd')
    .demand('botid')
    .demand('apikey')
    .describe('botid', 'Specify the username of the bot')
    .describe('apikey', 'Specify the API key for the bot')
    .describe('ggshost', 'GGS Hostname')
    .default('ggshost', 'ggs.online-go.com')
    .describe('ggsport', 'GGS Port')
    .default('ggsport', 80)
    .describe('resthost', 'REST Hostname')
    .default('resthost', 'online-go.com')
    .describe('restport', 'REST Port')
    .default('restport', 80)
    .describe('insecure', "Don't use ssl to connect to the ggs/rest servers [false]")
    .describe('insecureggs', "Don't use ssl to connect to the ggs servers [false]")
    .describe('insecurerest', "Don't use ssl to connect to the rest servers [false]")
    .describe('beta', 'Connect to the beta server (sets ggs/rest hosts to the beta server)')
    .describe('debug', 'Output GTP command and responses from your Go engine')
;
var argv = optimist.argv;

if (!argv._ || argv._.length == 0) {
    optimist.showHelp();
    process.exit();
}

/*
if (!argv.concurrency || argv.concurrency <= 0) {
    argv.concurrency = 1;
}
*/

if (argv.insecure) {
    argv.insecureggs = 1;
    argv.insecurerest = 1;
}

if (argv.beta) {
    argv.ggshost = 'ggsbeta.online-go.com';
    argv.ggsport = 80;
    argv.resthost = 'beta.online-go.com';
    argv.restport = 80;
}

if (argv.debug) {
    DEBUG = true;
}

var bot_command = argv._;


process.title = 'gtp2ogs ' + bot_command.join(' ');



var moves_processing = 0;

/*********/
/** Bot **/
/*********/
function Bot(cmd) { /* {{{ */
    var self = this;
    this.proc = spawn(cmd[0], cmd.slice(1));
    this.commands_sent = 0;
    this.command_callbacks = [];

    this.log("Starting ", cmd.join(' '));

    this.proc.stderr.on('data', function(data) {
        self.log("stderr: " + data);
    });
    var stdout_buffer = "";
    this.proc.stdout.on('data', function(data) {
        stdout_buffer += data.toString();
        if (stdout_buffer[stdout_buffer.length-1] != '\n') {
            //self.log("Partial result received, buffering until the output ends with a newline");
            return;
        }
        if (DEBUG) {
            self.log(stdout_buffer);
        }

        var lines = stdout_buffer.split("\n");
        stdout_buffer = "";
        for (var i=0; i < lines.length; ++i) {
            var line = lines[i];
            if (line.trim() == "") {
                continue;
            }
            if (line[0] == '=') {
                while (lines[i].trim() != "") {
                    ++i;
                }
                var cb = self.command_callbacks.shift();
                if (cb) cb(line.substr(1).trim());
            }
            else if (line.trim()[0] == '?') {
                self.log(line);
                while (lines[i].trim() != "") {
                    ++i;
                    self.log(lines[i]);
                }
            }
            else {
                self.log("Unexpected output: ", line);
                //throw new Error("Unexpected output: " + line);
            }
        }
    });

} /* }}} */
Bot.prototype.log = function(str) { /* {{{ */
    var arr = ["[" + this.proc.pid + "]"];
    for (var i=0; i < arguments.length; ++i) {
        arr.push(arguments[i]);
    }

    console.log.apply(null, arr);
} /* }}} */
Bot.prototype.loadState = function(state, cb, eb) { /* {{{ */
    this.command("boardsize " + state.width);
    this.command("clear_board");
    this.command("komi " + state.komi);

    if (state.initial_state) {
        var black = decodeMoves(state.initial_state.black, state.width);
        var white = decodeMoves(state.initial_state.white, state.width);

        if (black.length) {
            var s = "";
            for (var i=0; i < black.length; ++i) {
                s += " " + move2gtpvertex(black[i], state.width);
            }
            this.command("set_free_handicap " + s);
        }

        if (white.length) {
            /* no analagous command for white stones, so we just do moves instead */
            for (var i=0; i < white.length; ++i) {
                this.command("play white " + move2gtpvertex(white[i], state.width));
            }
        }
    }

    // Replay moves made
    var color = state.initial_player
    var handicaps_left = state.handicap
    var moves = decodeMoves(state.moves, state.width) 
    for (var i=0; i < moves.length; ++i) {
        var move = moves[i];
        var c = color
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
Bot.prototype.command = function(str, cb, eb) { /* {{{ */
    this.command_callbacks.push(cb);
    if (DEBUG) {
        this.log(">>>", str);
    }
    try {
        this.proc.stdin.write(str + "\r\n");
    } catch (e) {
        this.log("Failed to send command: ", str);
        this.log(e);
        if (eb) eb(e);
    }
} /* }}} */
Bot.prototype.genmove = function(state, cb) { /* {{{ */
    var self = this;
    this.command("genmove " + (this.last_color == 'black' ? 'white' : 'black'), 
        function(move) {
            move = typeof(move) == "string" ? move.toLowerCase() : null;
            var resign = move == 'resign';
            var pass = move == 'pass';
            var x=-1, y=-1;
            if (!resign && !pass) {
                if (move && move[0]) {
                    x = gtpchar2num(move[0]);
                    y = state.width - parseInt(move.substr(1))
                } else {
                    self.log("genmove failed, resigning");
                    resign = true;
                }
            }
            cb({'x': x, 'y': y, 'text': move, 'resign': resign, 'pass': pass});
        }
    )
} /* }}} */
Bot.prototype.kill = function() { /* {{{ */
    this.proc.kill();
} /* }}} */



/**********/
/** Game **/
/**********/
function Game(conn, game_id) { /* {{{ */
    var self = this;
    this.conn = conn;
    this.game_id = game_id;
    this.socket = conn.socket;
    this.state = null;
    this.waiting_on_gamedata_to_make_move = false;
    this.connected = true;

    self.socket.on('game/' + game_id + '/gamedata', function(gamedata) {
        if (!self.connected) return;
        self.log("gamedata")

        //self.log("Gamedata: ", gamedata);
        self.state = gamedata;
        if (self.state.phase == 'play') {
            if (self.waiting_on_gamedata_to_make_move) {
                self.waiting_on_gamedata_to_make_move = false;
                self.makeMove();
            }
        }
        else if (self.state.phase == 'finished') {
            self.log("Game is finished");
        }
    });
    self.socket.on('game/' + game_id + '/phase', function(phase) {
        if (!self.connected) return;
        self.log("phase ", phase)

        //self.log("Move: ", move);
        self.state.phase = phase;
        if (phase == 'play') {
            /* FIXME: This is pretty stupid.. we know what state we're in to
             * see if it's our move or not, but it's late and blindly sending
             * this out works as the server will reject bad moves */
            self.log("Game play resumed, sending pass because we're too lazy to check the state right now to see what we should do");
            self.socket.emit('game/move', self.auth({
                'game_id': self.state.game_id,
                'move': '..'
            }));
        }
    });
    self.socket.on('game/' + game_id + '/move', function(move) {
        if (!self.connected) return;
        //self.log("move")
        //self.log("Move: ", move);
        self.state.moves.push(move.move);
        if (self.bot) {
            self.bot.sendMove(decodeMoves(move.move, self.state.width)[0]);
        }
    });

    self.socket.emit('game/connect', self.auth({
        'game_id': game_id
    }));
} /* }}} */
Game.prototype.makeMove = function() { /* {{{ */
    var self = this;
    if (!this.state) {
        this.waiting_on_gamedata_to_make_move = true;
        return;
    }
    if (this.state.phase != 'play') {
        return;
    }

    var bot = new Bot(bot_command);
    ++moves_processing;

    var passed = false;
    function passAndRestart() {
        printf("pass and restart called");
        if (!passed) {
            passed = true;
            self.log("Bot process crashed, state was");
            self.log(self.state);
            self.socket.emit('game/move', self.auth({
                'game_id': self.state.game_id,
                'move': ".."
            }));
            --moves_processing;
            bot.kill();
        }
    }

    bot.log("Generating move for game ", this.game_id);
    bot.loadState(self.state, function() {
        self.log("State loaded");
    }, passAndRestart);

    bot.genmove(self.state, function(move) {
        --moves_processing;
        if (move.resign) {
            self.log("Resigning");
            self.socket.emit('game/resign', self.auth({
                'game_id': self.state.game_id
            }));
        }
        else {
            self.log("Playing " + move.text, move);
            self.socket.emit('game/move', self.auth({
                'game_id': self.state.game_id,
                'move': encodeMove(move)
            }));
        }
        bot.kill();
    }, passAndRestart);

    
} /* }}} */
Game.prototype.auth = function(obj) { /* {{{ */
    return this.conn.auth(obj);
}; /* }}} */
Game.prototype.disconnect = function() { /* {{{ */
    this.log("Disconnecting");

    this.connected = false;
    this.socket.emit('game/disconnect', this.auth({
        'game_id': this.game_id
    }));
}; /* }}} */
Game.prototype.log = function(str) { /* {{{ */
    var arr = ["[Game " + this.game_id + "]"];
    for (var i=0; i < arguments.length; ++i) {
        arr.push(arguments[i]);
    }

    console.log.apply(null, arr);
} /* }}} */



/****************/
/** Connection **/
/****************/
var ignorable_notifications = {
    'gameStarted': true,
    'gameEnded': true,
    'gameDeclined': true,
    'gameResumedFromStoneRemoval': true,
    'tournamentStarted': true,
    'tournamentEnded': true,
};

function Connection() { /* {{{ */
    var self = this;
    self.log("Connecting.."+(argv.insecureggs ? 'http://' : 'https://') + argv.ggshost + ':' + argv.ggsport);
    var socket = this.socket = io((argv.insecureggs ? 'http://' : 'https://') + argv.ggshost + ':' + argv.ggsport, { });

    this.connected_games = {};
    this.connected_game_timeouts = {};
    this.connected = false;

    socket.on('connect', function() {
        self.connected = true;
        self.log("Connected");

        socket.emit('bot/id', {'id': argv.botid}, function(id) {
            self.bot_id = id;
            if (!self.bot_id) {
                console.error("ERROR: Bot account is unknown to the system: " +   argv.botid);
                process.exit();
            }
            self.log("Bot is user id:", self.bot_id);
            self.auth({})
            socket.emit('notification/connect', self.auth({}), function(x) {
                self.log(x);
            })
            socket.emit('bot/connect', self.auth({ }), function() {
            })
        });
    });

    setInterval(function() {
        /* if we're sitting there bored, make sure we don't have any move
         * notifications that got lost in the shuffle... and maybe someday
         * we'll get it figured out how this happens in the first place. */
        if (moves_processing == 0) {
            //console.log("Resync of notifications");
            socket.emit('notification/connect', self.auth({}), function(x) {
                self.log(x);
            })
        }
    }, 10000);
    socket.on('event', function(data) {
        self.log(data);
    });
    socket.on('disconnect', function() {
        self.connected = false;
        self.log("Disconnected");
        for (var game_id in self.connected_games) {
            self.disconnectFromGame(game_id);
        }
    });



    socket.on('notification', function(notification) {
        if (self['on_' + notification.type]) {
            self['on_' + notification.type](notification);
        }
        else if (!(notification.type in ignorable_notifications)) {
            console.log("Unhandled notification type: ", notification.type, notification);
        }
    });
} /* }}} */
Connection.prototype.log = function(str) { /* {{{ */
    var arr = ["[" + argv.ggshost + argv.ggsport + "]"];
    for (var i=0; i < arguments.length; ++i) {
        arr.push(arguments[i]);
    }

    console.log.apply(null, arr);
} /* }}} */
Connection.prototype.auth = function (obj) { /* {{{ */
    obj.apikey = argv.apikey;
    obj.bot_id = this.bot_id;
    return obj;
} /* }}} */
Connection.prototype.connectToGame = function(game_id) { /* {{{ */
    var self = this;
    this.log("Connecting to game", game_id);

    if (game_id in self.connected_games) {
        clearInterval(self.connected_game_timeouts[game_id])
    }
    self.connected_game_timeouts[game_id] = setTimeout(function() {
        self.disconnectFromGame(game_id);
    }, 10*60*1000); /* forget about game after 10 mins */

    if (game_id in self.connected_games) {
        return self.connected_games[game_id];
    }
    return self.connected_games[game_id] = new Game(this, game_id);;
}; /* }}} */
Connection.prototype.disconnectFromGame = function(game_id) { /* {{{ */
    //this.log("Disconnected from game", game_id);
    if (game_id in this.connected_games) {
        clearInterval(this.connected_game_timeouts[game_id])
        this.connected_games[game_id].disconnect();
    }

    delete this.connected_games[game_id];
    delete this.connected_game_timeouts[game_id];
}; /* }}} */
Connection.prototype.deleteNotification = function(notification) { /* {{{ */
    var self = this;
    this.socket.emit('notification/delete', self.auth({notification_id: notification.id}), function(x) {
        self.log("Deleted notification ", notification.id);
    });
}; /* }}} */
Connection.prototype.connection_reset = function() { /* {{{ */
    for (var game_id in this.connected_games) {
        this.disconnectFromGame(game_id);
    }
}; /* }}} */
Connection.prototype.on_friendRequest = function(notification) { /* {{{ */
    var self = this;
    console.log("Friend request from ", notification.user.username);
    post(api1("me/friends/invitations"), 
        self.auth({ 'from_user': notification.user.id }),
        function(res) { self.log(res); }, 
        function(_, res) { self.log("ERROR", res); }
        )
        
    
}; /* }}} */
Connection.prototype.on_challenge = function(notification) { /* {{{ */
    var self = this;

    var reject = false;
    if (["japanese", "aga", "chinese", "korean"].indexOf(notification.rules) < 0) {
        self.log("Unhandled rules: " + notification.rules + ", rejecting challenge");
        reject = true;
    }

    if (notification.width != notification.height) {
        self.log("board was not square, rejecting challenge");
        reject = true;
    }

    if (!reject) {
        self.log("Accepting challenge, game_id = "  + notification.game_id);
        post('/api/v1/me/challenges/' + notification.challenge_id+'/accept', self.auth({ }),
            null, function(err) {
                self.log("Error accepting challenge, declining it");
                del('/api/v1/me/challenges/' + notification.challenge_id, self.auth({ }))
                self.deleteNotification(notification);
            })
    } else {
        del('/api/v1/me/challenges/' + notification.challenge_id, self.auth({ }))
    }
}; /* }}} */
Connection.prototype.on_yourMove = function(notification) { /* {{{ */
    //console.log("Making move", notification);
    //this.log("Got yourMove");
    this.log("yourMove received", notification.game_id);
    var game = this.connectToGame(notification.game_id)
    game.makeMove(function() {
        this.log("Move made", notification.game_id);
        /* TODO: There's no real reason to do this other than to keep the work flow
         * really simple for these bots. When we add support for keeping state and
         * having multiple instances going at the same time, we need to not just disconnect,
         * but rather keep track of our state and only disconnect after some time has
         * elapsed or the game is finished. */
        game.disconnect();
    });
}; /* }}} */
Connection.prototype.on_delete = function(notification) { /* {{{ */
    /* don't care about delete notifications */
}; /* }}} */
Connection.prototype.on_gameStarted = function(notification) { /* {{{ */
    /* don't care about gameStarted notifications */
}; /* }}} */
Connection.prototype.ok = function (str) { this.log(str); }
Connection.prototype.err = function (str) { this.log("ERROR: ", str); }



/**********/
/** Util **/
/**********/
function api1(str) { return "/api/v1/" + str; }
function post(path, data, cb, eb) { request("POST", argv.resthost, argv.restport, path, data, cb, eb); }
function get(path, data, cb, eb) { request("GET", argv.resthost, argv.restport, path, data, cb, eb); }
function put(path, data, cb, eb) { request("PUT", argv.resthost, argv.restport, path, data, cb, eb); }
function del(path, data, cb, eb) { request("DELETE", argv.resthost, argv.restport, path, data, cb, eb); }
function request(method, host, port, path, data, cb, eb) { /* {{{ */
    console.log(method, host, port, path, data);
    if (!eb) {
        eb = function(_, err) {
            console.log("ERROR: ", err);
        };
    }

    var enc_data_type = "application/x-www-form-urlencoded";
    for (var k in data) {
        if (typeof(data[k]) == "object") {
            enc_data_type = "application/json";
        }
    }

    var headers = null;
    if (data._headers) {
        data = dup(data)
        headers = data._headers;
        delete data._headers;
    }

    var enc_data = null;
    if (enc_data_type == "application/json") {
        enc_data = JSON.stringify(data);
    } else {
        enc_data = querystring.stringify(data);
    }

    var options = {
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
        for (var k in headers) {
            options.headers[k] = headers[k];
        }
    }

    var req = (argv.insecurerest ? http : https).request(options, function(res) {
        res.setEncoding('utf8');
        var body = "";
        res.on('data', function(chunk) {
            body += chunk;
        });
        res.on('end', function() {
            if (res.statusCode < 200 || res.statusCode > 299) {
                if (eb) eb(res, body);
                return;
            }
            if (cb) cb(res, body);
        });
    });
    req.on('error', function(a,b) {
        if (eb) eb(a,b);
    });

    req.write(enc_data);
    req.end();
} /* }}} */


function decodeMoves(move_obj, board_size) { /* {{{ */
    var ret = [];
    var width = board_size;
    var height = board_size;

    if (DEBUG) {
        console.log("Decoding ", move_obj);
    }

    function decodeSingleMoveArray(arr) {
        var obj = {
            x         : arr[0],
            y         : arr[1],
            timedelta : arr.length > 2 ? arr[2] : -1,
            color     : arr.length > 3 ? arr[3] : 0,
        }
        var extra = arr.length > 4 ? arr[4] : {};
        for (var k in extra) {
            obj[k] = extra[k];
        }
        return obj;
    }

    if (move_obj instanceof Array) {
        if (move_obj.length && typeof(move_obj[0]) == 'number') {
            ret.push(decodeSingleMoveArray(move_obj));
        }
        else {
            for (var i=0; i < move_obj.length; ++i) {
                var mv = move_obj[i];
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
            var move_string = move_obj;

            var moves = move_string.split(/([a-zA-Z][0-9]+|[.][.])/);
            for (var i=0; i < moves.length; ++i) {
                if (i%2) { /* even are the 'splits', which should always be blank unless there is an error */
                    var x = pretty_char2num(moves[i][0]);
                    var y = height-parseInt(moves[i].substring(1));
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
            var move_string = move_obj;

            for (var i=0; i < move_string.length-1; i += 2) {
                var edited = false;
                var color = 0;
                if (move_string[i+0] == '!') {
                    edited = true;
                    color = parseInt(move_string[i+1]);
                    i += 2;
                }


                var x = char2num(move_string[i]);
                var y = char2num(move_string[i+1]);
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


var conn = new Connection();
