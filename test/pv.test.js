// vim: tw=120 softtabstop=4 shiftwidth=4

const assert = require('assert');
const child_process = require('child_process');
const fs = require('fs');
const https = require('https');
const sinon = require('sinon');

const { FakeAPI } = require('./fake_modules/FakeAPI');
const { FakeGTP } = require('./fake_modules/FakeGTP');
const { FakeSocket } = require('./fake_modules/FakeSocket');
const { getNewConfig } = require('./module_loading/getNewConfig');
const { stub_console } = require('./utils/stub_console');

const { Bot } = require('../bot');
const config = getNewConfig();
const connection = require('../connection');

afterEach(function () {
    sinon.restore();
});

describe("Pv should work", () => {
    it("should pass bot stderr output to pv class", () => {
        stub_console();
        sinon.useFakeTimers();

        let fake_socket = new FakeSocket();
        let fake_api = new FakeAPI();
        fake_api.request({path: '/foo'}, () => {});
        sinon.stub(https, 'request').callsFake(fake_api.request);

        let fake_gtp = new FakeGTP();
        sinon.stub(child_process, 'spawn').returns(fake_gtp);

        let conn = new connection.Connection(() => { return fake_socket; }, config);

        const game = sinon.spy();
        config.ogspv = true;

        const bot = new Bot(conn, game, config.bot_command);

        bot.pv.postPvToChat = sinon.spy()

        fake_gtp.stderr.emit('data', 'bla');
        fake_gtp.stderr.emit('data', 'ble\r\n');
        fake_gtp.stderr.emit('data', 'blaor\r\n');

        assert.strictEqual(bot.pv.postPvToChat.callCount, 2); 
        assert.ok(bot.pv.postPvToChat.firstCall.calledWith('blable')); 
        assert.ok(bot.pv.postPvToChat.secondCall.calledWith('blaor')); 

        conn.terminate();
    });

    it("should output pv for leela zero", () => {
        const chatBody = { type: "analysis", name: "Winrate: 57.50%, Visits: 17937, Playouts: 17936", from: 2, moves: "ddcccddcedfbpddpqqpqqpqnrnrmqopnpooo", marks: { circle: "dd" } };
        testPv('LEELAZERO', 'leelaZeroOutput', chatBody);
    });

    it("should output pv for leela", () => {
        const chatBody = {type: "analysis", name: "Visits: 1435, Score: 51.28", from: 2, moves: "fqeqerdr", marks: {circle: "fq"}};
        testPv('LEELA', 'leelaOutput', chatBody);
    });

    it("should output pv for sai", () => {
        const chatBody = {type: "analysis", name: "Winrate: 56.84%, Score: -3.1, Visits: 12681, Playouts: 12680", from: 2, moves: "nceqepdqfrbobncocrdrbqdodnengobpcqdsemfnglec", marks: {circle: "nc"}};
        testPv('SAI', 'saiOutput', chatBody);
    });

    it("should output pv for kataGo", () => {
        const chatBody = {type: "analysis", name: "Visits: 4005, Winrate: 41.71, Score: -0.9", from: 2, moves: "cdpddpppfdfqcmcqdq", marks: {circle: "cd"}};
        testPv('KATAGO', 'kataGoOutput', chatBody);
    });

    it("should output pv for Phoenix Go", () => {
        const chatBody = {type: "analysis", name: "winrate=55.787468%, N=40, Q=0.115749, p=0.898028, v=0.083483, cost 5815.084473ms, sims=44", from: 2, moves: "eoncfdqcnqqnnk-f0t-f", marks: {circle: "eo"}};
        testPv('PHOENIXGO', 'phoenixGoOutput', chatBody);
    });

    function testPv(pvCode, fileName, chatBody) {
        stub_console();
        sinon.useFakeTimers();

        let fake_socket = new FakeSocket();
        let fake_api = new FakeAPI();
        fake_api.request({ path: '/foo' }, () => { });
        sinon.stub(https, 'request').callsFake(fake_api.request);

        let fake_gtp = new FakeGTP();
        sinon.stub(child_process, 'spawn').returns(fake_gtp);

        let conn = new connection.Connection(() => { return fake_socket; }, config);

        const game = sinon.spy();
        game.sendChat = sinon.spy();
        game.processing = true;
        game.state = { width: 19, moves: { length: 2 } };

        config.ogspv = pvCode;

        new Bot(conn, game, config.bot_command);

        fake_gtp.stderr.emit('data', fs.readFileSync(`./test/pv_samples/${fileName}.txt`));

        assert.strictEqual(game.sendChat.callCount, 1);
        assert.ok(game.sendChat.firstCall.calledWith(chatBody, 3, 'malkovich'));
        
        conn.terminate();
    }
});
