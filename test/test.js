// vim: tw=120 softtabstop=4 shiftwidth=4

let assert = require('assert');
let sinon = require('sinon');

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
config.bot_command = ['gtp-program', '--argument'];
config.timeout = 0; // needed for test.js
config.corrqueue = false; // needed for test.js

const allowed_r_u_Families = ["boardsizes",
                              "boardsizewidths",
                              "boardsizeheights",
                              "komis",
                              "rules",
                              "challengercolors",
                              "speeds",
                              "timecontrols"
                             ];
generateAllowedFamiliesRankedUnranked(allowed_r_u_Families);

// Fake a socket.io-client
class FakeSocket {
    constructor() {
        this.on_callbacks = {};
        this.emit_callbacks = {};
    }

    on(ev, cb) {
        console.log('client subscribe: ' + ev)
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
        console.log('server subscribe: ' + ev);
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
                if (ev === 'data') {
                    cb(response);
                }
                if (ev === 'end') {
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
            on: (_, cb) => {
                this.callbacks.stdin = cb;
            },
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

    on(ev, cb) {
        this.callbacks[ev] = cb;
    }

    on_cmd(cmd, cb) {
        console.log('GTP: ', cmd);
        this.cmd_callbacks[cmd] = cb;
    }

    gtp_response(data) {
        this.callbacks.stdout('= ' + data + "\n\n");
    }

    gtp_error(data) {
        this.callbacks.stdout('? ' + data + "\n\n");
    }

    exit(code) {
        if (this.callbacks.exit) {
            this.callbacks.exit({ code: code, signal: null });
        }
    }

    kill() {
        this.exit(1);
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
        timestamp: 0,
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
        start_time: 0,
        clock: {
            game_id: 1,
            current_player: 1,
            black_player_id: 1,
            white_player_id: 2,
            title: 'Friendly Match',
            last_move: 0,
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

function stub_console() {
    sinon.stub(console, 'log');
    sinon.stub(console, 'debug');
}

afterEach(function () {
    sinon.restore();
});

describe('A single game', () => {
    it('works end-to-end', function() {
        stub_console();
        sinon.useFakeTimers();

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

        let gamedata = base_gamedata({
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
        stub_console();
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
        for (let i = 1; i <= games; i++) {
            seen_moves[i] = 0;
            fakes.socket.inject('active_game', base_active_game({ id: i }));
        }

        // Simulate time passing
        for (let i = 0; i < 500; i++) {
            fakes.clock.tick(100);
        }

        // All games must have seen a move.
        for (let i = 1; i <= games; i++) {
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
        for (let i = 1; i <= games; i++) {
            seen_moves[i] = 0;
            fakes.socket.inject('active_game', base_active_game({ id: i }));
        }

        // Simulate time passing
        for (var i = 0; i < 500; i++) {
            fakes.clock.tick(100);
        }

        // All games must have seen a move.
        for (let i = 1; i <= games; i++) {
            assert.equal(seen_moves[i] > 0, true, 'Game '+i+' has seen no moves');
        }

        conn.terminate();
    });

    it('due to a missing gamedata', () => {
        let fakes = setupStubs();

        let genmove = sinon.spy();
        let fake_gtp = new FakeGTP();
        fake_gtp.on_cmd('genmove', () => {
            genmove();
            fake_gtp.gtp_response('Q4');
        });
        child_process.spawn.restore();
        sinon.stub(child_process, 'spawn').returns(fake_gtp);

        let conn = new connection.Connection(() => { return fakes.socket; });
        fakes.socket.inject('connect');
        fakes.socket.inject('active_game', base_active_game());
        assert.equal(genmove.called, false, 'Genmove called with missing gamedata');

        // Assume gamedata is sent on connection retry.
        fakes.socket.on_emit('game/connect', (connect) => {
            fakes.socket.inject('game/'+connect.game_id+'/gamedata', base_gamedata());
        });
        fakes.clock.tick(5000);
        assert.equal(genmove.called, true, 'Genmove called after retry');

        conn.terminate();
    });
});

describe('Periodic actions', () => {
    it('clean up idle games', () => {
        stub_console();
        // Idle games should be removed after 5 seconds.
        sinon.stub(config, 'timeout').value(5000);
        let clock = sinon.useFakeTimers();

        let fake_socket = new FakeSocket();
        fake_socket.on_emit('bot/id', () => { return {id: 1, jwt: 1} });
        let fake_api = new FakeAPI();
        sinon.stub(https, 'request').callsFake(fake_api.request);
        let fake_gtp = new FakeGTP();
        sinon.stub(child_process, 'spawn').returns(fake_gtp);

        fake_socket.on_emit('game/connect', (connect) => {
            let gamedata = base_gamedata({ id: connect.game_id })
            // Base gamedata indicates the last move was at time point 0, which is where the fake clock starts at, too.
            // Turn for the human to play.
            gamedata.clock.current_player = 2;
            fake_socket.inject('game/'+connect.game_id+'/gamedata', gamedata);
        });

        let conn = new connection.Connection(() => { return fake_socket; });
        fake_socket.inject('connect');

        // Create 10 games.
        for (var i = 0; i < 10; i++) {
            fake_socket.inject('active_game', base_active_game({ id: i }));
        }
        assert.equal(Object.keys(conn.connected_games).length, 10, 'Did not connect to all 10 games');

        // Advance the clock for half the games to have made a move at the 5th second.
        for (let i = 0; i < 5; i++) {
            let game_clock = base_gamedata().clock;
            game_clock.current_player = 2;
            game_clock.last_move = 5000;
            fake_socket.inject('game/'+i+'/clock', game_clock);
        }

        // Half the games are idle now.
        clock.tick(5100);
        setImmediate(conn.disconnectIdleGames.bind(conn));
        clock.next();
        assert.equal(Object.keys(conn.connected_games).length, 5, 'Did not disconnect half of the games');

        // All the games are idle now.
        clock.tick(5100);
        setImmediate(conn.disconnectIdleGames.bind(conn));
        clock.next();
        assert.equal(Object.keys(conn.connected_games).length, 0, 'Did not disconnect all the games');

        conn.terminate();
    });
});

describe("Retrying bot failures", () => {
    function setupStubs() {
        sinon.stub(console, 'log');
        let fake_clock = sinon.useFakeTimers();

        let fake_socket = new FakeSocket();
        fake_socket.on_emit('bot/id', () => { return {id: 1, jwt: 1} });

        let retry = sinon.spy();
        fake_socket.on_emit('game/connect', () => {
            retry();
            setTimeout(() => {
                fake_socket.inject('game/1/gamedata', base_gamedata());
            }, 1000);
        });

        let fake_gtp = new FakeGTP();
        sinon.stub(child_process, 'spawn').returns(fake_gtp);

        return {
            clock: fake_clock,
            socket: fake_socket,
            gtp: fake_gtp,
            failure: sinon.spy(),
            retry: retry,
            success: sinon.spy(),
        };
    }

    function ensureRetry(fakes) {
        let conn = new connection.Connection(() => { return fakes.socket; });
        fakes.socket.inject('connect');
        fakes.socket.inject('active_game', base_active_game());
        fakes.socket.inject('game/1/gamedata', base_gamedata());

        for (let i = 0; i < 10; i++) {
            fakes.clock.tick(1000);
        }

        assert.equal(fakes.failure.called, true, 'Bot failure not reached');
        assert.equal(fakes.retry.called, true, 'Retry not attempted');
        assert.equal(fakes.success.called, true, 'Retry does not succeed');

        conn.terminate();
    }

    it("crash at startup", () => {
        let fakes = setupStubs();

        child_process.spawn.restore();
        sinon.stub(child_process, 'spawn').callsFake(() => {
            child_process.spawn.restore();
            sinon.stub(child_process, 'spawn').returns(fakes.gtp);
            fakes.failure();
            throw new Error('spawn nosuchcommand ENOENT');
        });
        fakes.gtp.on_cmd('genmove', () => {
            fakes.success();
            fakes.gtp.gtp_result('Q4');
        });

        ensureRetry(fakes);
    }); 

    it("crash at write", () => {
        let fakes = setupStubs();

        fakes.gtp.on_cmd('genmove', () => {
            fakes.gtp.on_cmd('genmove', () => {
                fakes.success()
                fakes.gtp.gtp_result('Q4');
            });
            fakes.failure()
            setImmediate(fakes.gtp.callbacks.stdin, new Error('write EPIPE'));
        });

        ensureRetry(fakes);
    });

    it("silent crash during genmove", () => {
        let fakes = setupStubs();

        fakes.gtp.on_cmd('genmove', () => {
            fakes.gtp.on_cmd('genmove', () => {
                fakes.success()
                fakes.gtp.gtp_result('Q4');
            });
            fakes.failure();
            fakes.gtp.exit(1);
        });

        ensureRetry(fakes);
    });

    it("error during genmove", () => {
        let fakes = setupStubs();

        fakes.gtp.on_cmd('genmove', () => {
            fakes.gtp.on_cmd('genmove', () => {
                fakes.success()
                fakes.gtp.gtp_result('Q4');
            });
            fakes.failure();
            fakes.gtp.gtp_error('failed to generate');
        });

        ensureRetry(fakes);
    });

    it("giving up eventually", () => {
        let fakes = setupStubs();

        fakes.gtp.on_cmd('genmove', () => {
            fakes.failure();
            fakes.gtp.gtp_error('failed to generate');
        });
        fakes.socket.on_emit('game/resign', () => {
            // In this case, we eventually want to see the bot resign, so that is the "success" we are looking for.
            fakes.success();
        });

        ensureRetry(fakes);
    });
});

function generateAllowedFamiliesRankedUnranked(allowed_r_u_Families) {
    for (const r_u of ["ranked", "unranked"]) {
        config[r_u] = { banned_users: {},
                        allow_custom_boardsizes: false };

        for (const familyNameString of allowed_r_u_Families) {
            config[r_u][`allow_all_${familyNameString}`] = false;
            config[r_u][`allowed_${familyNameString}`] = {};
        }

        ["boardsizewidths",
         "boardsizeheights",
         "komis",
         "challengercolors"
        ].forEach( familyNameString => config[r_u][`allow_all_${familyNameString}`] = true );

        [ ["boardsizes", "19"],
          ["rules", "chinese"],
          ["speeds", "live"],
          ["timecontrols", "fischer"]
        ].forEach( ([familyNameString, allowedArg]) => config[r_u][`allowed_${familyNameString}`][allowedArg] = true );
    }
}
