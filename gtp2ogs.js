#!/usr/bin/env node

'use strict';

process.title = 'gtp2ogs';
var DEBUG = false;

/**************************/
/** Command line parsing **/ 
/**************************/
//var spawn = require('child_process').spawn;
var os = require('os')
var io = require('socket.io-client');
var sys = require('sys')
var querystring = require('querystring');
var http = require('http');
var https = require('https');
var crypto = require('crypto');
var exec = require('child_process').exec;
//var execFile = require('child_process').execFile;
//var fork = require('child_process').fork;
//var assert = require('assert');

var optimist = require("optimist")
    .usage("Usage: $0 --botid <bot-username> --apikey <apikey> [options] -- <botcommand> [bot arguments]\r\nBe aware of the space in front of botcommand.  Options are in the format '--option option_value --nextoption option_value'.")
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
    .default('ggsport', 443)
    .describe('resthost', 'REST Hostname')
    .default('resthost', 'online-go.com')
    .describe('restport', 'REST Port')
    .default('restport', 443)
    .describe('mintime', 'Minimum time per move in seconds.')
    .default('mintime', 30)
    .describe('maxtime', 'Maximum time per move in seconds.')
    .default('maxtime', 300)
    .describe('abusers', "A list of abuser separated by commas. Bot will refuse challenge from a user found on this list")
    .describe('insecure', "Don't use ssl to connect to the ggs/rest servers [false]")
    .describe('insecureggs', "Don't use ssl to connect to the ggs servers [false]")
    .describe('insecurerest', "Don't use ssl to connect to the rest servers [false]")
    //.describe('concurrency', 'Number of instances of your bot to concurrently handle requests [1]')
    .describe('beta', 'Connect to the beta server (sets ggs/rest hosts to the beta server)')
    .describe('debug', 'Output GTP command and responses from your Go engine');

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
    argv.resthost = 'beta.online-go.com';
}

if (argv.debug) {
    DEBUG = true;
}

var bot_command = argv._.join(' ');
var min_time = argv.mintime;
var max_time = argv.maxtime;

//process.title = 'gtp2ogs ' + bot_command.join(' ');
process.title = 'gtp2ogs ' + argv.botid;

var moves_processing = 0;
var active_games = {};
var bot_id = '';

/*********/
/** Bot **/
/*********/
//var bot_instances = []


function Bot(cmd) { /* {{{ */
    var self = this;
    var stdout_buffer = "";
    var char_buffer = "";
    
    this.proc = exec(bot_command);
        self.log("Bot PID: " + this.proc.pid);
    this.commands_sent = 0;
    this.command_callbacks = [];
        this.log("Started ", bot_command);

    this.proc.stderr.on('data', function(data) {
        self.log("stderr: ", data);
    });

    this.proc.stdout.on('data', function(data) {
        stdout_buffer += data.toString();
        if (stdout_buffer[stdout_buffer.length-1] != '\n') {
            if (DEBUG) {
              self.log("Partial result received, buffering until the output ends with a newline");
            }
            return;
        } else {
            char_buffer = stdout_buffer[stdout_buffer.length-3];
            if (DEBUG) {
                self.log("char_buffer: ", char_buffer);
            }
            if ((char_buffer == "=")||(char_buffer == "")||(char_buffer == " ")) {
                if (DEBUG) {
                    self.log("Continue buffering until valid data comes in", char_buffer);
                }
                return;
            }
        }
        if (DEBUG) {
            self.log("stdout buffer: ", stdout_buffer);
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
                    self.log("lines[i]", lines[i]);
                }
            }
            else {
                self.log("Unexpected message from bot: ", line);
                //throw new Error("Unexpected bot output: " + line);
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
    var color = 1;
    this.command("boardsize " + state.width);
    this.command("clear_board");
    this.command("komi " + state.komi);

    if (state.initial_state.black) {
        var black = decodeMoves(state.initial_state.black, state.width);
        var s = "";
        for (var i=0; i < black.length; ++i) {
            s += " " + move2gtpvertex(black[i], state.width);
        }
        this.command("set_free_handicap " + s); 
    }
    if (state.initial_state.white) {
        var white = decodeMoves(state.initial_state.white, state.width);
        /* no analagous command for white stones, so we just do moves instead */
        for (var i=0; i < white.length; ++i) {
            this.command("play white " + move2gtpvertex(white[i], state.width));
        }
    }

    // Replay moves made
    if (state.initial_player == 'white') {
        var color = 2;
    }
    var handicaps_left = state.handicap;
    var moves = decodeMoves(state.moves, state.width);
    for (var i=0; i < moves.length; ++i) {
        var move = moves[i];
        var c = color;
        if (move.edited) {
            c = move['color']
        } 
        else {
            if (state.free_handicap_placement && handicaps_left > 1) {
                handicaps_left -= 1;
            } 
            else {
                color = color == 1 ? 2 : 1;
            }
        }
        this.command("play " + (c == 1 ?  'black' : 'white') + ' ' + move2gtpvertex(move, state.width))
    }
    this.last_color = color;
    //this.command("showboard", cb, eb);
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


//tk: ### addition FROM THIS LINE ###

    var my_color = "";
    if (state.black_player_id == bot_id) {
	my_color = "black";
        //self.log("my color is ", my_color);
    }
    if (state.white_player_id == bot_id) {
	my_color = "white";
        //self.log("my color is ", my_color);
    }
        //self.log("I am playing", my_color);
    //this.command("name");

    try {
        this.proc.stdin.write("\r\n");
        //this.command("version");
    } catch (e) {
        self.log("stdin pipe to bot broken.", e);
    }
    if (state.clock.current_player != bot_id) {
        self.log("current player: "+ state.clock.current_player, "bot id: " + bot_id);
        self.log("genmove called on opponent's turn");
        return;
    }
    self.log("bot genmove, my_color = " + my_color + ", last_color = " + this.last_color);

//tk: ### addition TO THIS LINE ###


    //self.command("genmove " + (self.last_color == 1 ? 'black' : 'white'), 
    this.command("genmove " + my_color,	function(move) {
        //self.log("stdin: ", self.proc.stdin);

        self.log("typeof(move) = " + typeof(move));
        move = typeof(move) == "string" ? move.toLowerCase() : null;
        var resign = move == 'resign';
        var pass = move == 'pass';
        var x=-1, y=-1;
        if (!resign && !pass) {
            if (move && move[0]) {
			     self.log("(!resign && !pass) && (move && move[0])");
			     self.log("move[0] = " + move[0]);
                     x = gtpchar2num(move[0]);
			         self.log("x = " + x);
			         self.log("state.width = " + state.width);
			         self.log("move.substr(1) = " + move.substr(1));
                        y = state.width - parseInt(move.substr(1));
			         self.log("y = " + y);
            } else {
                 self.log("genmove failed, resigning");
                     resign = true;
            }
	    }
            cb({'x': x, 'y': y, 'text': move, 'resign': resign, 'pass': pass});
    })
    this.last_color = this.last_color == 1 ? 2 : 1;
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
    //this.state = null;
    
    this.waiting_on_gamedata_to_make_move = false;
    this.connected = true;

    self.socket.on('game/' + game_id + '/gamedata', function(gamedata) {
        if (!self.connected) return;
        this.state = null;
        if (DEBUG) {
            self.log("Gamedata: ", gamedata);
        }
        self.state = gamedata;
        this.state = gamedata;
        if (self.state.phase == 'play') {
	        if (self.state.clock.current_player == self.bot_id) {
               if (self.waiting_on_gamedata_to_make_move) {
                  self.waiting_on_gamedata_to_make_move = false;
		          self.makeMove();
	           }
            }
        }
        else if (self.state.phase == 'stone removal') {
            self.log("Game is in the stone removal phase");
            self.setAndAcceptRemovedStones(self.state);
        }
        else if (self.state.phase == 'finished') {
            delete active_games[this.game_id];
            self.log("Game is finished");
        }
    });
    self.socket.on('game/' + game_id + '/phase', function(phase) {
        if (!self.connected) return;
        if (DEBUG) {
            self.log("phase ", phase);
        }
        self.state.phase = phase;
        //this.state.phase = phase;
        if (phase == 'stone removal') {
            self.setAndAcceptRemovedStones();
        }
        if (phase == 'play') {
            /* FIXME: This is pretty stupid.. we know what state we're in to
             * see if it's our move or not, but it's late and blindly sending
             * this out works as the server will reject bad moves 
            self.log("Game play resumed, sending pass because we're too lazy to check the state right now to see what we should do");
            self.socket.emit('bot/connect', self.auth({}), function() {
            });
            self.socket.emit('game/move', self.auth({
                'game_id': self.state.game_id,
                'move': '..'
            }));          /* tk: replaced the above with   */
        
        //From this line
	        if (self.state.clock.current_player == self.bot_id) {
               //if (self.waiting_on_gamedata_to_make_move) {
                  //self.waiting_on_gamedata_to_make_move = false;
                  self.log("Game play resumed");
		          self.makeMove();
	           //}
            } else {
            return;
            }
        //To this line 
        
        }
    });
    self.socket.on('game/' + game_id + '/move', function(move) {
        if (!self.connected) return;
        if (!self.state) return;
        //self.log("move")
        //self.log("Move: ", move);
        self.state.moves += move.move;
        //this.state.moves += move.move;
        if (self.bot) {
            self.bot.sendMove(decodeMoves(move.move, self.state.width)[0]);
        }
    });
    self.socket.on('game/' + game_id + '/removed_stones', function(move) {
        if (!self.connected) return;
        self.setAndAcceptRemovedStones(self.state);
    });

    self.socket.emit('bot/connect', self.auth({}), function() {
    });
    self.socket.emit('game/connect', self.auth({
        'game_id': game_id
    }));
} /* }}} */

Game.prototype.makeMove = function() { /* {{{ */
    var self = this;
    if (!this.state) {
        this.waiting_on_gamedata_to_make_move = true;
        self.log("Waiting for gamedata.");
        return;
    }
    if (this.state.phase != 'play') {
        return;
    }

    var bot = new Bot(bot_command);
    ++moves_processing;
    var passed = false;
    function passAndRestart() {
        if (!passed) {
            passed = true;
            self.log("Bot process crashed, state was");
            self.log(self.state);
            self.socket.emit('bot/connect', self.auth({}), function() {
            });
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
            self.socket.emit('bot/connect', self.auth({}), function() {
            });
            self.socket.emit('game/resign', self.auth({
                'game_id': self.state.game_id
            }));
        }
        else {
            self.log("Playing " + move.text);
            self.socket.emit('bot/connect', self.auth({}), function() {
            });
            self.socket.emit('game/move', self.auth({
                'game_id': self.state.game_id,
                'move': encodeMove(move)
            }));
            /* tk: Apparently this sending of move twice is needed as
              sending once gets sometimes ignored by the server, even
              after sending the above 'bot/connect' beforehand. */
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
    this.socket.emit('bot/connect', this.auth({}), function() {
    });
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

Game.prototype.setAndAcceptRemovedStones = function() { /* {{{ */
    /* TODO: We should add a flag that if set, tells us to ask the go engine
     * what it thinks dead stones are. Not all engines support this, so if not
     * set we should probably just keep accepting whatever the human thinks is
     * right. 
     *
     * See http://ogs.readme.io/v4.2/docs/real-time-api for the api endpoints
     * necessary to make this happen
     */

    this.log("Accepting any stones the human says are dead");
    this.socket.emit('bot/connect', this.auth({}), function() {
    });
    this.socket.emit('game/removed_stones/accept', this.auth({
        'game_id': this.state['game_id'],
        'stones': '--accept-any--'
    }))
} /* }}} */



/****************/
/** Connection **/
/****************/
var ignorable_notifications = {
    'gameStarted': true,
    'gameEnded': true,
    'gameDeclined': true,
    'gameResumedFromStoneRemoval': true,
    'tournamentInvitation': true,
    'tournamentStarted': true,
    'tournamentEnded': true,
};

function Connection() { /* {{{ */
    var self = this;
    self.log("Connecting..");
    var socket = this.socket = io((argv.insecureggs ? 'http://' : 'https://') + argv.ggshost + ':' + argv.ggsport, { });

    this.connected_games = {};
    this.connected_game_timeouts = {};
    this.connected = false;

    socket.on('connect', function() {
        self.connected = true;
        self.log("Connected");
        socket.emit('bot/id', {'id': argv.botid}, function(id) {
            bot_id = id;
            if (!bot_id) {
                console.error("ERROR: Bot account is unknown to the system: " + argv.botid);
                process.exit();
            }
            self.log("Bot is user id:", bot_id);
            self.auth({});
            socket.emit('notification/connect', self.auth({}), function(x) {
                self.log(x);
            });
            socket.emit('bot/connect', self.auth({}), function() {
            });
        });
    });

    setInterval(function() {
        /* if we're sitting there bored, make sure we don't have any move
         * notifications that got lost in the shuffle... and maybe someday
         * we'll get it figured out how this happens in the first place. */
        if (moves_processing == 0) {
            //console.log("Resync of notifications");
            self.socket.emit('bot/connect', self.auth({}), function() {
            });
            self.socket.emit('notification/connect', self.auth({}), function(x) {
                self.log(x);
            });
        }
    }, 10000);
    
    socket.on('event', function(data) {
        self.log(data);
    });
    
    socket.on('disconnect', function(reason) {
        self.connected = false;
        self.log("Disconnected by server with reason: ", reason);
        for (var game_id in self.connected_games) {
            self.disconnectFromGame(game_id);
        }
        if (moves_processing > 0) {
            Bot.prototype.kill();
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
    var arr = ["[" + argv.ggshost + "]"];
    for (var i=0; i < arguments.length; ++i) {
        arr.push(arguments[i]);
    }
    console.log.apply(null, arr);
} /* }}} */

Connection.prototype.auth = function (obj) { /* {{{ */
    obj.apikey = argv.apikey;
    obj.bot_id = bot_id;
    return obj;
} /* }}} */

Connection.prototype.connectToGame = function(game_id) { /* {{{ */
    var self = this;
    this.log("Connecting to game", game_id);

    if (game_id in self.connected_games) {
        clearInterval(self.connected_game_timeouts[game_id]);
        if (!active_games[game_id]) {
            active_games[game_id] = true;
        }
    }
    self.connected_game_timeouts[game_id] = setTimeout(function() {
        self.disconnectFromGame(game_id);
        delete active_games[game_id];
    }, 10*60*1000); /* forget about game after 10 mins */

    if (game_id in self.connected_games) {
        return self.connected_games[game_id];
    }
    active_games[game_id] = true;
    return self.connected_games[game_id] = new Game(this, game_id);
}; /* }}} */

Connection.prototype.disconnectFromGame = function(game_id) { /* {{{ */
    if (game_id in this.connected_games) {
        clearInterval(this.connected_game_timeouts[game_id])
        this.connected_games[game_id].disconnect();
        delete this.connected_game_timeouts[game_id];
        delete this.connected_games[game_id];
        this.log("Initiated disconnection from game", game_id);
    }
}; /* }}} */

Connection.prototype.deleteNotification = function(notification) { /* {{{ */
    var self = this;
    this.socket.emit('bot/connect', self.auth({}), function() {
    });
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
      //self.log(notification);

    //var challenger_data = notification.challenger;
    var challenger = notification.user.username;
    var time_param = notification.time_control;
    var reject = false;
    if (["japanese", "aga", "chinese", "korean"].indexOf(notification.rules) < 0) {
        self.log("Unhandled rule: " + notification.rules + ", rejecting challenge from ", challenger);
        reject = true;
    }
    if (notification.width != notification.height) {
        self.log(notification.width, "x", notification.height, "not square, rejecting challenge from ", challenger);
        reject = true;
    }
    if (notification.handicap > 9) {
        self.log("Handicap ", notification.handicap, ", rejecting challenge from ", challenger);
        reject = true;
    }
      /* tk: temp solution, remember to remove */
    if (notification.width < 13) {
        self.log(notification.width, "x", notification.width, ", rejecting challenge from ", challenger);
        reject = true;
    }
      /* tk: temp solution, remember to remove */
    if (notification.width > 19) {
        self.log(notification.width, "x", notification.width, ", rejecting challenge from ", challenger);
        reject = true;
    }
    if (notification.pause_on_weekends) {
        self.log("I can't pause on weekends, rejecting challenge from ", challenger);
        reject = true;
    }
    if (notification.time_per_move < min_time) {
        self.log("Time per move ", notification.time_per_move, "sec, rejecting challenge from ", challenger);
        reject = true;
    }
    if (notification.time_per_move > max_time) {
        self.log("Time per move ", notification.time_per_move, "sec, rejecting challenge from ", challenger);
        reject = true;
    }
    if (time_param.time_control == "none"){
      self.log("No time control, rejecting challenge from ", challenger);
      reject = true;
    }
    if ((time_param.time_control == "byoyomi")||(time_param.time_control == "canadian")){
      if (time_param.main_time < min_time * 20) {
        self.log(time_param.main_time/60, "min Byoyomi/Canadian, rejecting challenge from ", challenger);
        reject = true;
      }
      else if (time_param.main_time > max_time * 12) {
        self.log(time_param.main_time/60, "min Byoyomi/Canadian, rejecting challenge from ", challenger);
        reject = true;
      }
      if (time_param.period_time > max_time * 8) {
        self.log(time_param.period_time/60, "min periods Byoyomi/Canadian, rejecting challenge from ", challenger);
        reject = true;
      }
    }
    if (time_param.time_control == "fischer") {
      if (time_param.initial_time < min_time * 20) {
        self.log(time_param.main_time/60, "min Fischer, rejecting challenge from ", challenger);
        reject = true;
      }
      else if (time_param.initial_time > max_time * 10) {
        self.log(time_param.main_time/60, "min Fischer, rejecting challenge from ", challenger);
        reject = true;
      }
      if (time_param.max_time < min_time * 20) {
        self.log(time_param.max_time/60, "min max Fischer, rejecting challenge from ", challenger);
        reject = true;
      }
      if (time_param.time_increment > max_time) {
        self.log(time_param.time_increment/60, "min increment Fischer, rejecting challenge from ", challenger);
        reject = true;
      }
    }
    if (time_param.time_control == "absolute") {
      if (time_param.total_time < min_time * 20) {
        self.log(time_param.total_time/60, "min Absolute, rejecting challenge from ", challenger);
        reject = true;
      }
      else if (time_param.total_time > max_time * 12) {
        self.log(time_param.total_time/60, "min Absolute, rejecting challenge from ", challenger);
        reject = true;
      }
    }
    if (time_param.time_control == "simple") {
      if (time_param.per_move < min_time) {
        self.log(time_param.time_control, "sec Simple, rejecting challenge from ", challenger);
        reject = true;
      }
      else if (time_param.per_move > max_time) {
        self.log(time_param.time_control/60, "min Simple, rejecting challenge from ", challenger);
        reject = true;
      }
    }

    /* Check that the challenger is not one of known abusers. */
    if (argv.abusers !== undefined && argv.abusers !== "") {
        var abusers = argv.abusers.split(",");
	var isAbuser = function(abuser) {
		return abuser === challenger;
	}
        if (abusers.filter(isAbuser).length() > 0 ) {
                self.log(challenger, "is an abuser, rejecting challenge");
		reject = true;
	}
    }
      /* tk: temp solution, remember to remove */
    if ((self.connected_games.length > 0)||(active_games.length >= 1)) {
         self.log("Active games: ", active_games.length, "rejecting challenge from ", challenger);
         reject = true;
    }
      /* tk: temp solution, remember to remove */
    if ((self.moves_processing > 0)||(this.waiting_on_gamedata_to_make_move)) {
         self.log("I'm busy, rejecting challenge from ", challenger);
         reject = true;
        
    }
    /* tk: temp solution, remember to remove */
    //if (Bot.proc.pid) {
         //self.log("I'm busy, rejecting challenge from ", challenger);
         //reject = true;
    //}


    if (!reject) {
        self.log("Accepting challenge, game_id = "  + notification.game_id, challenger);
        post('/api/v1/me/challenges/' + notification.challenge_id+'/accept', self.auth({ }),
            null, function(err) {
                self.log("Error accepting challenge, declining it");
                del('/api/v1/me/challenges/' + notification.challenge_id, self.auth({ }))
                self.deleteNotification(notification);
            })
        active_games[notification.game_id] = true;
        //post('/api/v1/me/challenges/' + (notification.challenge_id) + '/accept', self.auth({ }))
    } else {
        del('/api/v1/me/challenges/' + notification.challenge_id, self.auth({ }))
    }
}; /* }}} */

Connection.prototype.on_yourMove = function(notification) { /* {{{ */
    //console.log("Making move", notification);
    //this.log("Got yourMove");
    if (DEBUG) {
        this.log("'yourMove' received from server", notification);
    }
    var game = this.connectToGame(notification.game_id);
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

    if (move_obj instanceof Array) {
        for (var i=0; i < move_obj.length; ++i) {
            ret = ret.concat(decodeMoves(move_obj, board_size));
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
                    ret.push({"x": x, "y": y, "special": false, "edited": false, "color": 0});
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
                var special = false;
                if (move_string[i+0] == '!') {
                    edited = true;
                    color = parseInt(move_string[i+1]);
                    i += 2;
                    special = true;
                }
                var x = char2num(move_string[i]);
                var y = char2num(move_string[i+1]);
                if (width && x >= width) x = y= -1;
                if (height && y >= height) x = y = -1;
                ret.push({"x": x, "y": y, "special": special, "edited": edited, "color": color});
            }
        }
    } 
    else {
        return {
            "special": true
        };
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
}; /* }}} */

function move2gtpvertex(move, board_size) { /* {{{ */
    if (move.x < 0) {
        return "pass";
    }
    return num2gtpchar(move['x']) + (board_size-move['y'])
}; /* }}} */

function gtpchar2num(ch) { /* {{{ */
    if (ch == "." || !ch)
        return -1;
    return "abcdefghjklmnopqrstuvwxyz".indexOf(ch.toLowerCase());
}; /* }}} */

function num2gtpchar(num) { /* {{{ */
    if (num == -1) 
        return ".";
    return "abcdefghjklmnopqrstuvwxyz"[num];
}; /* }}} */


/**************************/
/** Initialize instances **/
/**************************/

/*
for (var i=0; i < argv.concurrency; ++i) {
    bot_instances.push(new Bot(bot_command));
}
if (!bot_instances)  {
    optimist.showHelp();
    process.exit();
}
*/

var conn = new Connection();
