// vim: tw=120 softtabstop=4 shiftwidth=4

let assert = require('assert');
let sinon = require('sinon');
let util = require('util');

let connection = require('../connection');
let config = require('../config');
let console = require('../console').console;

let child_process = require('child_process');
let https = require('https');

config.DEBUG = true;
config.apikey = 'deadbeef';
config.host = 'test';
config.port = 80;
config.username = 'testbot';
config.allowed_sizes[19] = true;
config.allowed_speeds['live'] = true;
config.allowed_timecontrols['fischer'] = true;
config.allow_all_komi = true;
config.bot_command = ['gtp-program', '--argument'];

// Fake a socket.io-client
class FakeSocket {
    constructor() {
        this.on_callbacks = {};
        this.emit_callbacks = {};
    }

    on(ev, cb) {
        console.log('client on: ' + ev)
        this.on_callbacks[ev] = cb;
    }

    inject(ev, data) {
        console.log('client on(' + ev + ')')
        this.on_callbacks[ev](data);
    }

    emit(ev, data, cb) {
        if (config.DEBUG) {
            console.log('client: ' + ev);
        }
        var ret;
        if (this.emit_callbacks[ev]) {
            ret = this.emit_callbacks[ev](data);
        }
        if (cb) {
            cb(ret);
        }
    }

    on_emit(ev, cb) {
        this.emit_callbacks[ev] = cb;
    }
}

// Fake http/https request 
class FakeAPI {
    constructor() {
        this.callbacks = {};
        this.request = this.request.bind(this);
    }

    on_path(path, cb) {
        this.callbacks[path] = cb;
    }

    request(options, cb) {
        let response = '';
        console.log('api ' + options.path);
        if (this.callbacks[options.path]) {
            response = this.callbacks[options.path](options);
        }
        cb({
            statusCode: 200,
            setEncoding: () => {},
            on: (ev, cb) => {
                if (ev == 'data') {
                    cb(response);
                }
                if (ev == 'end') {
                    cb();
                }
            },
        });
        return {
            on: () => {},
            write: () => {},
            end: () => {},
        };
    }
}

// Fake GTP child_process (spwan)
class FakeGTP {
    constructor() {
        this.pid = 100;
        this.callbacks = {};
        this.cmd_callbacks = {};
        this.stderr = { on: (_, cb) => {
            this.callbacks.stderr = cb;
        }};
        this.stdout = { on: (_, cb) => {
            this.callbacks.stdout = cb;
        }};
        this.stdin = {
            end: () => {},
            write: (data) => {
                if (config.DEBUG) {
                    console.log('STDIN: ', data.trim());
                }
                let cmd = data.trim().split(' ')[0];
                if (this.cmd_callbacks[cmd]) {
                    this.cmd_callbacks[cmd](data.trim());
                } else {
                    this.gtp_response('');
                }
            }
        };
    }

    on_cmd(cmd, cb) {
        this.cmd_callbacks[cmd] = cb;
    }

    gtp_response(data) {
        this.callbacks.stdout('= ' + data + "\n\n");
    }
}

function base_challenge(overrides) {
    let base = {
        type: 'challenge',
        challenge_id: 1,
        player_id: 1,
        game_id: 1,
        id: '1', // GUID
        challenger_color: 'white',
        user: {
            id: 2,
            username: 'human',
            rating: 1000.0,
            ranking: 10.0,
            professional: false,
        },
        rules: 'chinese',
        ranked: true,
        width: 19,
        height: 19,
        handicap: 0,
        komi: 7.5,
        time_control: {
            speed: 'live',
            system: 'fischer',
            time_control: 'fischer',
            initial_time: 120,
            max_time: 300,
            time_increment: 30,
            pause_on_weekends: false,
        },
        disable_analysis: false,
        aga_rated: false,
        aux_delivered: 0,
        read: 0,
        timestamp: 0, // TODO: now
        read_timestamp: 0,
    }
    return Object.assign({}, base, overrides);
}

function base_active_game(overrides) {
    let base = {
        id: 1,
        phase: 'play',
        name: 'Friendly Match',
        player_to_move: 1,
        time_per_move: 89280,
        width: 19,
        height: 19,
        move_number: 0,
        paused: 0,
        private: false,
        black: {
            id: 1,
            username: 'testbot',
            rank: 10,
            professional: false,
            accepted: false,
        },
        white: {
            id: 2,
            username: 'human',
            rank: 10,
            professional: false,
            accepted: false,
        },
    }
    return Object.assign({}, base, overrides);
}

function base_gamedata(overrides) {
    let base = {
        game_id: 1,
        game_name: 'Friendly Match',
        phase: 'play',
        komi: 7.5,
        handicap: 0,
        width: 19,
        height: 19,
        private: false,
        ranked: false,
        rules: 'chinese',
        time_control: {
            system: 'fischer',
            pause_on_weekends: false,
            time_control: 'fischer',
            initial_time: 120,
            max_time: 300,
            time_increment: 30,
            speed: 'live',
        },
        start_time: 0,  // TODO: now.
        clock: {
            game_id: 1,
            current_player: 1,
            black_player_id: 1,
            white_player_id: 2,
            title: 'Friendly Match',
            last_move: Date.now(),
            expiration: 0, // TODO
            black_time: { thinking_time: 30, skip_bonus: false },
            white_time: { thinking_time: 30, skip_bonus: false },
            start_mode: true,
        },
        initial_player: 'black',
        black_player_id: 1,
        white_player_id: 2,
        players: {
            black: {
                id: 1,
                username: 'testbot',
                rank: 10,
                professional: false,
            },
            white: {
                id: 2,
                username: 'human',
                rank: 10,
                professional: false,
            },
        },
        moves: [],
        meta_groups: [],
        history: [],
        initial_state: { black: '', white: '' },
        pause_on_weekends: false,
        disable_analysis: false,
        allow_self_capture: false,
        automatic_stone_removal: false,
        free_handicap_placement: true,
        aga_handicap_scoring: false,
        allow_ko: false,
        allow_superko: false,
        superko_algorithm: 'ssk',
        score_territory: true,
        score_territory_in_seki: true,
        score_stones: true,
        score_handicap: true,
        score_prisoners: false,
        score_passes: true,
        white_must_pass_last: false,
        opponent_plays_first_after_resume: false,
        strict_seki_mode: false,
        original_disable_analysis: false,
    };
    return Object.assign({}, base, overrides);
}

afterEach(function () {
    sinon.restore();
});

describe('A single game', () => {
    it('works end-to-end', function() {
        sinon.stub(console, 'log');

        let fake_socket = new FakeSocket();
        let fake_api = new FakeAPI();
        fake_api.request({path: '/foo'}, () => {});
        sinon.stub(https, 'request').callsFake(fake_api.request);

        let fake_gtp = new FakeGTP();
        sinon.stub(child_process, 'spawn').returns(fake_gtp);

        let conn = new connection.Connection(() => { return fake_socket; });

        let bot_id = sinon.spy();
        let bot_connect = sinon.spy();
        let authenticate = sinon.spy();
        let notification_connect = sinon.spy();
        fake_socket.on_emit('bot/id', () => {
            bot_id();
            return {id: 1, jwt: 1};
        });
        fake_socket.on_emit('authenticate', authenticate);
        fake_socket.on_emit('notification/connect', () => {
            notification_connect();
            return 'connected';
        });
        fake_socket.on_emit('bot/connect', bot_connect);
        fake_socket.inject('connect');

        assert.equal(bot_id.called, true);
        assert.equal(authenticate.called, true);
        assert.equal(notification_connect.called, true);
        assert.equal(bot_connect.called, true);

        let accept = sinon.spy();
        fake_api.on_path('/api/v1/me/challenges/1/accept', accept);
        fake_socket.inject('notification', base_challenge());
        assert.equal(accept.called, true);

        fake_socket.inject('active_game', base_active_game());

        // Missing gameStarted notification.

        let genmove = sinon.spy();
        let play = sinon.spy();
        let game_move = sinon.spy()
        fake_gtp.on_cmd('genmove', (arg) => {
            genmove(arg);
            fake_gtp.gtp_response('Q4');
        });
        fake_gtp.on_cmd('play', play);
        fake_socket.on_emit('game/move', game_move);

        fake_socket.inject('game/1/gamedata', base_gamedata());
        fake_socket.inject('game/1/clock', base_gamedata().clock);

        assert.equal(genmove.called, true);
        assert.equal(game_move.called, true);

        fake_socket.inject('game/1/move', {
            game_id: 1,
            move_number: 1,
            move: [15, 15],
        });
        fake_socket.inject('game/1/move', {
            game_id: 1,
            move_number: 2,
            move: [3, 3],
        });

        assert.equal(play.called, true);

        fake_socket.inject('game/1/move', {
            game_id: 1,
            move_number: 3,
            move: [3, 3],
        });

        gamedata = base_gamedata({
            phase: 'finished',
            winner: 1,
            outcome: 'Resignation',
        });
        fake_socket.inject('game/1/gamedata', gamedata);

        conn.terminate();
    });
});

describe('Games do not hang', () => {
    function setupStubs() {
        sinon.stub(console, 'log');
        let clock = sinon.useFakeTimers();

        let fake_socket = new FakeSocket();
        fake_socket.on_emit('bot/id', () => { return {id: 1, jwt: 1} });
        let fake_api = new FakeAPI();
        sinon.stub(https, 'request').callsFake(fake_api.request);

        sinon.stub(child_process, 'spawn').callsFake(() => {
            let fake_gtp = new FakeGTP();
            fake_gtp.on_cmd('genmove', () => {
                // Takes 1 second to generate a move.
                setTimeout(() => {
                    fake_gtp.gtp_response('Q4');
                }, 1000);
            });
            return fake_gtp;
        });

        return {
            clock: clock,
            socket: fake_socket,
            api: fake_api,
        }
    }

    function setupGames(fakes) {
        fakes.socket.on_emit('game/connect', (connect) => {
            let gamedata = base_gamedata({
                game_id: connect.game_id,
            });
            gamedata.time_control.speed = 'correspondence';
            fakes.socket.inject('game/'+connect.game_id+'/gamedata', gamedata);
        });

        let seen_moves = {};

        fakes.socket.on_emit('game/move', (move) => {
            let move_number = seen_moves[move.game_id];
            fakes.socket.inject('game/'+move.game_id+'/move', {
                move_number: ++seen_moves[move.game_id],
                move: [15, 15],
            });
            // Respond to move in 1 second.
            setTimeout(() => {
                seen_moves[move.game_id]++;
                fakes.socket.inject('game/'+move.game_id+'/move', {
                    move_number: ++seen_moves[move.game_id],
                    move: [15, 15],
                });
            }, 1000);
        });

        return seen_moves;
    }


    it('due to correspondence queue starvation', () => {
        let fakes = setupStubs();
        sinon.stub(config, 'corrqueue').value(true);

        let conn = new connection.Connection(() => { return fakes.socket; });
        let seen_moves = setupGames(fakes);
        fakes.socket.inject('connect');

        // Set up the games.
        let games = 5;
        for (var i = 1; i <= games; i++) {
            seen_moves[i] = 0;
            fakes.socket.inject('active_game', base_active_game({ id: i }));
        }

        // Simulate time passing
        for (var i = 0; i < 500; i++) {
            fakes.clock.tick(100);
        }

        // All games must have seen a move.
        for (var i = 1; i <= games; i++) {
            assert.equal(seen_moves[i] > 0, true, 'Game '+i+' has seen no moves');
        }

        conn.terminate();
    });

    it('due to a timeout on a game waiting for move', () => {
        let fakes = setupStubs();
        sinon.stub(config, 'corrqueue').value(true);
        sinon.stub(config, 'timeout').value(5);

        let conn = new connection.Connection(() => { return fakes.socket; });
        let seen_moves = setupGames(fakes);
        fakes.socket.inject('connect');

        // Set up the games.
        let games = 5;
        for (var i = 1; i <= games; i++) {
            seen_moves[i] = 0;
            fakes.socket.inject('active_game', base_active_game({ id: i }));
        }

        // Simulate time passing
        for (var i = 0; i < 500; i++) {
            fakes.clock.tick(100);
        }

        // All games must have seen a move.
        for (var i = 1; i <= games; i++) {
            assert.equal(seen_moves[i] > 0, true, 'Game '+i+' has seen no moves');
        }

        conn.terminate();
    });
});
