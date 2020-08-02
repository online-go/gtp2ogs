// vim: tw=120 softtabstop=4 shiftwidth=4

const assert = require('assert');
const child_process = require('child_process');
const https = require('https');
const sinon = require('sinon');

const { base_active_game } = require('./base_server_packets/base_active_game');
const { base_challenge } = require('./base_server_packets/base_challenge');
const { base_gamedata } = require('./base_server_packets/base_gamedata');
const { FakeAPI } = require('./fake_modules/FakeAPI');
const { FakeGTP } = require('./fake_modules/FakeGTP');
const { FakeSocket } = require('./fake_modules/FakeSocket');
const { getNewConfig } = require('./module_loading/getNewConfig');
const { stub_console } = require('./utils/stub_console');

const config = getNewConfig();
const connection = require('../connection');
const { console } = require('../console');

config.timeout = 0;
config.corrqueue = false;

afterEach(function () {
    sinon.restore();
});

describe('A single game', () => {
    it('works end-to-end', function() {
        stub_console();
        sinon.useFakeTimers();

        const fake_socket = new FakeSocket();
        const fake_api = new FakeAPI();
        fake_api.request({path: '/foo'}, () => {});
        sinon.stub(https, 'request').callsFake(fake_api.request);

        const fake_gtp = new FakeGTP();
        sinon.stub(child_process, 'spawn').returns(fake_gtp);

        const conn = new connection.Connection(() => { return fake_socket; }, config);

        const bot_id = sinon.spy();
        const bot_connect = sinon.spy();
        const authenticate = sinon.spy();
        const notification_connect = sinon.spy();
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

        const accept = sinon.spy();
        fake_api.on_path('/api/v1/me/challenges/1/accept', accept);
        fake_socket.inject('notification', base_challenge());
        assert.equal(accept.called, true);

        fake_socket.inject('active_game', base_active_game());

        // Missing gameStarted notification.

        const genmove = sinon.spy();
        const play = sinon.spy();
        const game_move = sinon.spy()
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

        const gamedata = base_gamedata({
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
        const clock = sinon.useFakeTimers();

        const fake_socket = new FakeSocket();
        fake_socket.on_emit('bot/id', () => { return {id: 1, jwt: 1} });
        const fake_api = new FakeAPI();
        sinon.stub(https, 'request').callsFake(fake_api.request);

        sinon.stub(child_process, 'spawn').callsFake(() => {
            const fake_gtp = new FakeGTP();
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
            const gamedata = base_gamedata({
                game_id: connect.game_id,
            });
            gamedata.time_control.speed = 'correspondence';
            fakes.socket.inject('game/'+connect.game_id+'/gamedata', gamedata);
        });

        const seen_moves = {};

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
        const fakes = setupStubs();
        sinon.stub(config, 'corrqueue').value(true);

        const conn = new connection.Connection(() => { return fakes.socket; }, config);
        const seen_moves = setupGames(fakes);
        fakes.socket.inject('connect');

        // Set up the games.
        const games = 5;
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
        const fakes = setupStubs();
        sinon.stub(config, 'corrqueue').value(true);
        sinon.stub(config, 'timeout').value(5);

        const conn = new connection.Connection(() => { return fakes.socket; }, config);
        const seen_moves = setupGames(fakes);
        fakes.socket.inject('connect');

        // Set up the games.
        const games = 5;
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

    it('due to a missing gamedata', () => {
        const fakes = setupStubs();

        const genmove = sinon.spy();
        const fake_gtp = new FakeGTP();
        fake_gtp.on_cmd('genmove', () => {
            genmove();
            fake_gtp.gtp_response('Q4');
        });
        child_process.spawn.restore();
        sinon.stub(child_process, 'spawn').returns(fake_gtp);

        const conn = new connection.Connection(() => { return fakes.socket; }, config);
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
        const clock = sinon.useFakeTimers();

        const fake_socket = new FakeSocket();
        fake_socket.on_emit('bot/id', () => { return {id: 1, jwt: 1} });
        const fake_api = new FakeAPI();
        sinon.stub(https, 'request').callsFake(fake_api.request);
        const fake_gtp = new FakeGTP();
        sinon.stub(child_process, 'spawn').returns(fake_gtp);

        fake_socket.on_emit('game/connect', (connect) => {
            const gamedata = base_gamedata({ id: connect.game_id })
            // Base gamedata indicates the last move was at time point 0, which is where the fake clock starts at, too.
            // Turn for the human to play.
            gamedata.clock.current_player = 2;
            fake_socket.inject('game/'+connect.game_id+'/gamedata', gamedata);
        });

        const conn = new connection.Connection(() => { return fake_socket; }, config);
        fake_socket.inject('connect');

        // Create 10 games.
        for (let i = 0; i < 10; i++) {
            fake_socket.inject('active_game', base_active_game({ id: i }));
        }
        assert.equal(Object.keys(conn.connected_games).length, 10, 'Did not connect to all 10 games');

        // Advance the clock for half the games to have made a move at the 5th second.
        for (let i = 0; i < 5; i++) {
            const game_clock = base_gamedata().clock;
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
        const fake_clock = sinon.useFakeTimers();

        const fake_socket = new FakeSocket();
        fake_socket.on_emit('bot/id', () => { return {id: 1, jwt: 1} });

        const retry = sinon.spy();
        fake_socket.on_emit('game/connect', () => {
            retry();
            setTimeout(() => {
                fake_socket.inject('game/1/gamedata', base_gamedata());
            }, 1000);
        });

        const fake_gtp = new FakeGTP();
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
        const conn = new connection.Connection(() => { return fakes.socket; }, config);
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
        const fakes = setupStubs();

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
        const fakes = setupStubs();

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
        const fakes = setupStubs();

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
        const fakes = setupStubs();

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
        const fakes = setupStubs();

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
