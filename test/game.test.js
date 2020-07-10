// vim: tw=120 softtabstop=4 shiftwidth=4

const assert = require('assert');
const child_process = require('child_process');
const https = require('https');
const sinon = require('sinon');

const { base_gamedata } = require('./base_server_packets/base_gamedata');
const { FakeAPI } = require('./fake_modules/FakeAPI');
const { FakeGTP } = require('./fake_modules/FakeGTP');
const { FakeSocket } = require('./fake_modules/FakeSocket');
const { getNewConfigUncached } = require('./module_loading/getNewConfigUncached');
const { getNewConnectionUncached } = require('./module_loading/getNewConnectionUncached');
const { stub_console } = require('./utils/stub_console');

let config;
let connection;

afterEach(function () {
    sinon.restore();
});

describe('Game', () => {
  
    let game;
    
    beforeEach(function() {
        config = getNewConfigUncached();
        connection = getNewConnectionUncached();

        stub_console();
        sinon.useFakeTimers();
        
        const fake_api = new FakeAPI();
        fake_api.request({path: '/foo'}, () => {});
        sinon.stub(https, 'request').callsFake(fake_api.request);
        
        const fake_socket = new FakeSocket();
        const conn = new connection.Connection(() => { return fake_socket; }, config);
        
        let fake_gtp = new FakeGTP();
        sinon.stub(child_process, 'spawn').returns(fake_gtp);
        conn.connectToGame(1);
        game = conn.connected_games[1];
    });
  
    describe('Persist', () => {

        let fakeKill;

        beforeEach(function() {
            fakeKill = sinon.spy();
            game.ensureBotKilled = fakeKill;
        });

        it('stops the bot if persist is off', () => {
            game.state = base_gamedata({ game_id: game.game_id });

            game.getBotMoves("genmove b", () => {});

            assert(fakeKill.calledOnce);
        });

        it('does not stops the bot if persist is on', () => {
            config.persist = true;
            game.state = base_gamedata({ game_id: game.game_id });

            game.getBotMoves("genmove b", () => {});

            assert(fakeKill.notCalled);
        });

        it('does not stops the bot if persistnoncorr is on in blitz', () => {
            config.persistnoncorr = true;
            game.state = base_gamedata({ game_id: game.game_id, time_control: { speed: 'blitz' } });

            game.getBotMoves("genmove b", () => {});

            assert(fakeKill.notCalled);
        });

        it('does not stops the bot if persistnoncorr is on in live', () => {
            config.persistnoncorr = true;
            game.state = base_gamedata({ game_id: game.game_id, time_control: { speed: 'live' } });

            game.getBotMoves("genmove b", () => {});

            assert(fakeKill.notCalled);
        });

        it('stops the bot if persistnoncorr is on in correspondence', () => {
            config.persistnoncorr = true;
            game.state = base_gamedata({ game_id: game.game_id, time_control: { speed: 'correspondence' } });

            game.getBotMoves("genmove b", () => {});

            assert(fakeKill.calledOnce);
        });

    });

});
