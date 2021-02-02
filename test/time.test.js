
const assert = require('assert');
const { Bot } = require('../bot');
const { FakeAPI } = require('./fake_modules/FakeAPI');
const { FakeGTP } = require('./fake_modules/FakeGTP');
const { FakeSocket } = require('./fake_modules/FakeSocket');
const { getNewConfig } = require('./module_loading/getNewConfig');
const https = require('https');
const child_process = require('child_process');
const sinon = require('sinon');
const config = getNewConfig();
const connection = require('../connection');
const { stub_console } = require('./utils/stub_console');

afterEach(() => sinon.restore());

const fischer_time = {
    "system": "fischer",
    "initial_time": 86400, /* in seconds */
    "time_increment": 3600,  /* in seconds */
    "max_time": 172800  /* in seconds */
}
const fischer_clock = {
    thinking_time: 12345, /* seconds */
}

const byoYomi_time = {
    "system": "byoyomi",
    "main_time": 86400, /* seconds */
    "period_time": 3600,  /* seconds */
    "periods": 5      /* count */
}

const byoYomi_clock = {
    thinking_time: 12345, /* seconds */
    periods: 5,     /* periods left */
    period_time: 3600,    /* seconds */
}

const byoYomi_overtime = {
    thinking_time: 0, /* seconds */
    periods: 3,     /* periods left */
    period_time: 3600,    /* seconds */
}

const byoYomi_overtime1 = {
    thinking_time: 0, /* seconds */
    periods: 1,     /* periods left */
    period_time: 3600,    /* seconds */
}

const simple_time = {
    "system": "simple",
    "per_move": 12345  /* seconds */
}

const simple_clock = 12345 /* this field is simply a number of seconds on the clock, 
will be 0 for the player not playing (this is subject to change, and may become 
  number of seconds left on the clock for the last move instead of simply 0 in 
  the future.) */

const canadian_time = {
    "system": "canadian",
    "main_time": 86400, /* seconds */
    "period_time": 3600, /* seconds */
    "stones_per_period": 10     /* count */
}

const canadian_clock = {
    thinking_time: 12345, /* seconds */

    /* applicable only when thinking_time == 0, however 
     * the fields will always exist */
    moves_left: 10,  /* moves left in this period  */
    block_time: 3600   /* seconds left in this period  */
}

const canadian_overtime = {
    thinking_time: 0, /* seconds */

    /* applicable only when thinking_time == 0, however 
     * the fields will always exist */
    moves_left: 10,    /* moves left in this period  */
    block_time: 2000   /* seconds left in this period  */
}

const canadian_overtime1 = {
    thinking_time: 0, /* seconds */

    /* applicable only when thinking_time == 0, however 
     * the fields will always exist */
    moves_left: 1,    /* moves left in this period  */
    block_time: 200   /* seconds left in this period  */
}

const absolute_time = {
    "system": "absolute",
    "total_time": 86400  /* seconds */
}

const absolute_clock = {
    thinking_time: 12345  /* seconds */
}

const none_time = {
    "system": "none"
}

// The `black_time` and `white_time` fields do not exist for the `none` time control.

describe("Time should be reported", () => {
    let bot;
    let state;
    let clock;
    const init_time = Date.now();

    beforeEach(() => {
        stub_console();
        clock = sinon.useFakeTimers(init_time);
        let fake_socket = new FakeSocket();
        let fake_api = new FakeAPI();
        fake_api.request({ path: '/foo' }, () => { });
        sinon.stub(https, 'request').callsFake(fake_api.request);

        let fake_gtp = new FakeGTP();
        sinon.stub(child_process, 'spawn').returns(fake_gtp);

        let conn = new connection.Connection(() => { return fake_socket; }, config);

        const game = sinon.spy();
        config.ogspv = true;
        config.startupbuffer = 2000;

        bot = new Bot(conn, game, config.bot_command);
        bot.command = sinon.spy();
        state = {
            clock: {
                black_time: {},
                white_time: {},
                current_player: 1, // white
                last_move: init_time - 4400, // last move was made 4.4 seconds ago.
                now: init_time - 300, // unused on client, but this is the server time.
                game_id: 989449,
                black_player_id: 12751,
                white_player_id: 1,
                title: "friendly match",
                // paused_since: 1416093910,   /* seconds since epoch */
                // expiration_delta: 1350000,  /* milliseconds */
                // expiration: 1416174229750,  /* milliseconds since epoch */
            },
            time_control: {},
        }
    });

    afterEach(() => {
        clock.restore();
    });

    it("should load the clock", () => {
        state.time_control = byoYomi_time;
        state.clock.black_time = byoYomi_clock;
        state.clock.white_time = byoYomi_clock;

        bot.loadClock(state);
        assert.deepStrictEqual(bot.command.args, [
            ["time_settings 100800 3600 1"],
            ["time_left black 26745 0"],
            ["time_left white 26738 0"]
        ]);
    });

    it("should substract startup bufffer on first move", () => {
        state.time_control = byoYomi_time;
        state.clock.black_time = byoYomi_clock;
        state.clock.white_time = byoYomi_clock;
        config.startupbuffer = 4000;

        bot.loadClock(state);
        assert.deepStrictEqual(bot.command.args, [
            ["time_settings 100800 3600 1"],
            ["time_left black 26745 0"],
            ["time_left white 26736 0"]
        ]);
    });

    it("should not substract startup bufffer after first move", () => {
        state.time_control = byoYomi_time;
        state.clock.black_time = byoYomi_clock;
        state.clock.white_time = byoYomi_clock;
        bot.firstmove = false;

        bot.loadClock(state);
        assert.deepStrictEqual(bot.command.args, [
            ["time_settings 100800 3600 1"],
            ["time_left black 26745 0"],
            ["time_left white 26740 0"]
        ]);
    });

    describe("for japanese byo-yomi", () => {
        beforeEach(() => {
            state.time_control = byoYomi_time;
            state.clock.black_time = byoYomi_clock;
            state.clock.white_time = byoYomi_clock;
        });

        describe("in gtp time", () => {
            it("main time", () => {
                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 100800 3600 1"], // we add 4 of the 5 periods to the main time, so 86400+4*3600=100800. After that 1 stone per 3600 seconds byo-yomi.
                    ["time_left black 26745 0"], // 12345 main time left + 4*3600 perod time = 26745. 0 for main time.
                    ["time_left white 26738 0"] //  should be 26745 - 6.4s (since last move and startup buffer) = 26745-6.4 = 26738 (rounded down)
                ]);
            });

            it("main time rollover into period time", () => {
                state.clock.last_move = init_time - (12345 + 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 100800 3600 1"], // we add 4 of the 5 periods to the main time, so 86400+4*3600=100800. After that 1 stone per 3600 seconds byo-yomi.
                    ["time_left black 26745 0"], // 12345 main time left + 4*3600 perod time = 26745. 0 for main time.
                    ["time_left white 13398 0"] //  should be 26745 - 12345 - 1000 - 2 (since last move and startup buffer) = 26745-13347 = 13398 (rounded down)
                ]);
            });

            it("main time rollover into last period", () => {
                state.clock.last_move = init_time - (12345 + 4 * 3600 + 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 100800 3600 1"], // we add 4 of the 5 periods to the main time, so 86400+4*3600=100800. After that 1 stone per 3600 seconds byo-yomi.
                    ["time_left black 26745 0"], // 12345 main time left + 4*3600 perod time = 26745. 0 for main time.
                    ["time_left white 2598 1"] //  should be 26745 - 12345 - 4*3600 - 1000 - 2 (since last move and startup buffer) = 26745-26745 - 1002 = rolled into last period 3600 - 1002 = 2598
                ]);
            });

            it("rollover should not be negative", () => {
                state.clock.last_move = init_time - (123450 + 4 * 3600 + 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 100800 3600 1"], // we add 4 of the 5 periods to the main time, so 86400+4*3600=100800. After that 1 stone per 3600 seconds byo-yomi.
                    ["time_left black 26745 0"], // 12345 main time left + 4*3600 perod time = 26745. 0 for main time.
                    ["time_left white 0 1"]
                ]);
            });

            it("overtime with periods left", () => {
                state.clock.black_time = byoYomi_overtime;
                state.clock.white_time = byoYomi_overtime;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 100800 3600 1"], // we add 4 of the 5 periods to the main time, so 86400+4*3600=100800. After that 1 stone per 3600 seconds byo-yomi.
                    ["time_left black 7200 0"], // 2*3600=7200 main time left. 0 for main time.
                    ["time_left white 7193 0"] //  should be 7200 - 6.4s = 7200-6.4 = 7193 (rounded down)
                ]);
            });

            it("over time with 1 period left", () => {
                state.clock.black_time = byoYomi_overtime1;
                state.clock.white_time = byoYomi_overtime1;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 100800 3600 1"], // we add 4 of the 5 periods to the main time, so 86400+4*3600=100800. After that 1 stone per 3600 seconds byo-yomi.
                    ["time_left black 3600 1"], // 3600 period time left. 1 for period time.
                    ["time_left white 3593 1"] //  should be 3600 - 6.4s = 3593 (rounded down)
                ]);
            });
        });

        describe("in kgs time", () => {
            beforeEach(() => {
                bot.kgstime = true;
            });

            it("main time", () => {
                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["kgs-time_settings byoyomi 86400 3600 5"],
                    ["time_left black 12345 0"], // 12345 main time left. 0 for main time.
                    ["time_left white 12338 0"] //  12345 main time left - 6.4s = 12338. 0 for main time.
                ]);
            });

            it("main time rollover into period time", () => {
                state.clock.last_move = init_time - (12345 + 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["kgs-time_settings byoyomi 86400 3600 5"],
                    ["time_left black 12345 0"], // 12345 main time left. 0 for main time.
                    ["time_left white 2598 5"] // 12345 - 12345 - 1000 - 2 (since last move and startup buffer) = first overtime used and 3600-1002s remaining = 2598 4
                ]);
            });

            it("main time rollover into last period", () => {
                state.clock.last_move = init_time - (12345 + 4 * 3600 + 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["kgs-time_settings byoyomi 86400 3600 5"],
                    ["time_left black 12345 0"], // 12345 main time left. 0 for main time.
                    ["time_left white 2598 1"] // should be 26745 - 12345 - 1000 - 2 (since last move and startup buffer) = 26745-13347 = 13398 (rounded down)
                ]);
            });

            it("rollover should not be negative", () => {
                state.clock.last_move = init_time - (123450 + 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["kgs-time_settings byoyomi 86400 3600 5"],
                    ["time_left black 12345 0"], // 12345 main time left. 0 for main time.
                    ["time_left white 0 1"]
                ]);
            });

            it("overtime with periods left", () => {
                state.clock.black_time = byoYomi_overtime;
                state.clock.white_time = byoYomi_overtime;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["kgs-time_settings byoyomi 86400 3600 5"],
                    ["time_left black 3600 3"],
                    ["time_left white 3593 3"] // should be 3600 - 6.4s = 3593 (rounded down), and 3 remaining periods
                ]);
            });

            it("over time with 1 period left", () => {
                state.clock.black_time = byoYomi_overtime1;
                state.clock.white_time = byoYomi_overtime1;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["kgs-time_settings byoyomi 86400 3600 5"],
                    ["time_left black 3600 1"], // 3600 period time left. 1 for period time.
                    ["time_left white 3593 1"] //  should be 3600 - 6.4s = 3593 (rounded down)
                ]);
            });
        });
    });

    describe("for canadese byo-yomi", () => {
        beforeEach(() => {
            state.time_control = canadian_time;
            state.clock.black_time = canadian_clock;
            state.clock.white_time = canadian_clock;
        });

        describe("in gtp time", () => {
            it("main time", () => {
                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 86400 3600 10"],
                    ["time_left black 12345 0"],
                    ["time_left white 12338 0"] // 12345 - 6.4s delay and startup buffer
                ]);
            });

            it("main time rollover into period time", () => {
                state.clock.last_move = init_time - (12345 + 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 86400 3600 10"],
                    ["time_left black 12345 0"],
                    ["time_left white 2598 10"]
                ]);
            });

            it("rollover should not be negative", () => {
                state.clock.last_move = init_time - (123450 + 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 86400 3600 10"],
                    ["time_left black 12345 0"],
                    ["time_left white 0 10"]
                ]);
            });

            it("overtime with stones left", () => {
                state.clock.black_time = canadian_overtime;
                state.clock.white_time = canadian_overtime;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 86400 3600 10"],
                    ["time_left black 2000 10"],
                    ["time_left white 1993 10"] // 2000 - 6.4 rounded down
                ]);
            });

            it("over time with 1 stone left", () => {
                state.clock.black_time = canadian_overtime1;
                state.clock.white_time = canadian_overtime1;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 86400 3600 10"],
                    ["time_left black 200 1"],
                    ["time_left white 193 1"] // 2000 - 6.4 rounded down
                ]);
            });
        });

        describe("in kgs time", () => {
            beforeEach(() => {
                bot.kgstime = true;
            });

            it("main time", () => {
                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["kgs-time_settings canadian 86400 3600 10"],
                    ["time_left black 12345 0"],
                    ["time_left white 12338 0"] // 12345 - 6.4 rounded down
                ]);
            });

            it("main time rollover into period time", () => {
                state.clock.last_move = init_time - (12345 + 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["kgs-time_settings canadian 86400 3600 10"],
                    ["time_left black 12345 0"],
                    ["time_left white 2598 10"]
                ]);
            });

            it("rollover should not be negative", () => {
                state.clock.last_move = init_time - (123450 + 4 * 3600 + 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["kgs-time_settings canadian 86400 3600 10"],
                    ["time_left black 12345 0"],
                    ["time_left white 0 10"]
                ]);
            });

            it("overtime with stones left", () => {
                state.clock.black_time = canadian_overtime;
                state.clock.white_time = canadian_overtime;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["kgs-time_settings canadian 86400 3600 10"],
                    ["time_left black 2000 10"],
                    ["time_left white 1993 10"] // 2000 - 6.4 rounded down
                ]);
            });

            it("over time with 1 stone left", () => {
                state.clock.black_time = canadian_overtime1;
                state.clock.white_time = canadian_overtime1;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["kgs-time_settings canadian 86400 3600 10"],
                    ["time_left black 200 1"],
                    ["time_left white 193 1"] // 200 - 6.4 rounded down
                ]);
            });
        });
    });

    describe("for fischer", () => {
        beforeEach(() => {
            state.time_control = fischer_time;
            state.clock.black_time = fischer_clock;
            state.clock.white_time = fischer_clock;
        });

        describe("in gtp time", () => {
            it("main time", () => {
                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 82800 3600 1"],
                    ["time_left black 8745 0"], // 12345 - 3600 = 8745 main time left.
                    ["time_left white 8738 0"]
                ]);
            });

            it("main time rollover into period time", () => {
                state.clock.last_move = init_time - (8745 + 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 82800 3600 1"],
                    ["time_left black 8745 0"],
                    ["time_left white 2598 1"]
                ]);
            });

            it("rollover should not be negative", () => {
                state.clock.last_move = init_time - (87450 + 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 82800 3600 1"],
                    ["time_left black 8745 0"],
                    ["time_left white 0 1"]
                ]);
            });
        });

        describe("in kata time", () => {
            beforeEach(() => {
                bot.kgstime = true;
            });

            it("main time", () => {
                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["kgs-time_settings canadian 82800 3600 1"],
                    ["time_left black 8745 0"],
                    ["time_left white 8738 0"]
                ]);
            });

            it("main time rollover into period time", () => {
                state.clock.last_move = init_time - (8745 + 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["kgs-time_settings canadian 82800 3600 1"],
                    ["time_left black 8745 0"],
                    ["time_left white 2598 1"]
                ]);
            });

            it("rollover should not be negative", () => {
                state.clock.last_move = init_time - (87450 + 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["kgs-time_settings canadian 82800 3600 1"],
                    ["time_left black 8745 0"],
                    ["time_left white 0 1"]
                ]);
            });
        });

        describe("in kgs time", () => {
            beforeEach(() => {
                bot.katafischer = true;
            });

            it("main time", () => {
                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["kata-time_settings fischer-capped 86400 3600 172800 -1"],
                    ["time_left black 12345 0"],
                    ["time_left white 12338 0"]
                ]);
            });

            it("main time rollover into period time", () => {
                state.clock.last_move = init_time - (8745 + 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["kata-time_settings fischer-capped 86400 3600 172800 -1"],
                    ["time_left black 12345 0"],
                    ["time_left white 2598 0"]
                ]);
            });

            it("rollover should not be negative", () => {
                state.clock.last_move = init_time - (87450 + 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["kata-time_settings fischer-capped 86400 3600 172800 -1"],
                    ["time_left black 12345 0"],
                    ["time_left white 0 0"]
                ]);
            });
        });
    });

    describe("for simple", () => {
        beforeEach(() => {
            state.time_control = simple_time;
            state.clock.black_time = simple_clock;
            state.clock.white_time = simple_clock;
        });

        describe("in gtp time", () => {
            it("period time", () => {
                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 0 12345 1"],
                    ["time_left black 12345 1"],
                    ["time_left white 12338 1"] // 12345 - 6.4s delay and startup buffer = 12338, 1 for overtime.
                ]);
            });

            it("period time with delay", () => {
                state.clock.last_move = init_time - (12345 - 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 0 12345 1"],
                    ["time_left black 12345 1"],
                    ["time_left white 998 1"]
                ]);
            });

            it("period time with delay should not go negative", () => {
                state.clock.last_move = init_time - (123450 + 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 0 12345 1"],
                    ["time_left black 12345 1"],
                    ["time_left white 0 1"]
                ]);
            });
        });

        describe("in kgs time", () => {
            beforeEach(() => {
                bot.kgstime = true;
            });

            it("period time", () => {
                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 0 12345 1"],
                    ["time_left black 12345 1"],
                    ["time_left white 12338 1"] // 12345 - 6.4s delay and startup buffer = 12338, 1 for overtime.
                ]);
            });

            it("period time with delay", () => {
                state.clock.last_move = init_time - (12345 - 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 0 12345 1"],
                    ["time_left black 12345 1"],
                    ["time_left white 998 1"]
                ]);
            });

            it("period time with delay should not go negative", () => {
                state.clock.last_move = init_time - (123450 + 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 0 12345 1"],
                    ["time_left black 12345 1"],
                    ["time_left white 0 1"]
                ]);
            });
        });
    });

    describe("for absolute", () => {
        beforeEach(() => {
            state.time_control = absolute_time;
            state.clock.black_time = absolute_clock;
            state.clock.white_time = absolute_clock;
        });

        describe("in gtp time", () => {
            it("main time", () => {
                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 86400 0 0"],
                    ["time_left black 12345 0"],
                    ["time_left white 12338 0"] // 12345 - 6.4s delay and startup buffer = 12338, 0 for main time.
                ]);
            });

            it("absolute time with delay", () => {
                state.clock.last_move = init_time - (12345 - 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 86400 0 0"],
                    ["time_left black 12345 0"],
                    ["time_left white 998 0"]
                ]);
            });

            it("absolute time with delay should not go negative", () => {
                state.clock.last_move = init_time - (123450 + 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 86400 0 0"],
                    ["time_left black 12345 0"],
                    ["time_left white 0 0"]
                ]);
            });
        });

        describe("in kgs time", () => {
            beforeEach(() => {
                bot.kgstime = true;
            });

            it("main time", () => {
                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 86400 0 0"],
                    ["time_left black 12345 0"],
                    ["time_left white 12338 0"] // 12345 - 6.4s delay and startup buffer = 12338, 0 for main time.
                ]);
            });

            it("main time black move", () => {
                bot.loadClock(state);
                state.clock.current_player = state.clock.black_player_id;

                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 86400 0 0"],
                    ["time_left black 12345 0"],
                    ["time_left white 12338 0"] // 12345 - 6.4s delay and startup buffer = 12338, 0 for main time
                ]);
            });

            it("absolute time with delay", () => {
                state.clock.last_move = init_time - (12345 - 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 86400 0 0"],
                    ["time_left black 12345 0"],
                    ["time_left white 998 0"]
                ]);
            });

            it("absolute time with delay should not go negative", () => {
                state.clock.last_move = init_time - (123450 + 1000) * 1000;

                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, [
                    ["time_settings 86400 0 0"],
                    ["time_left black 12345 0"],
                    ["time_left white 0 0"]
                ]);
            });
        });
    });

    describe("for none", () => {
        beforeEach(() => {
            state.time_control = none_time;
        });

        describe("in gtp time", () => {
            it("no time", () => {
                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, []);
            });
        });

        describe("in kgs time", () => {
            beforeEach(() => {
                bot.kgstime = true;
            });

            it("no time", () => {
                bot.loadClock(state);
                assert.deepStrictEqual(bot.command.args, []);
            });
        });
    });
    /*
        todo:
            byo-yomi:
                katago -> same as kgs time
            canadese:
                katago -> same as kgs time
            fischer:
                katago -> direct
            simple:
                katago -> same as kgs time
            absolute:
                katago -> same as kgs time
    */
});