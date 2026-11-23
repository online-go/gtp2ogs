const BOT_ID = 1;
const OPPONENT_ID = 2;
const GAME_ID = 123;

jest.mock("../socket", () => {
    const { EventEmitter } = jest.requireActual("eventemitter3");
    const socket = new EventEmitter();
    socket.send = jest.fn();
    socket.connected = true;
    return { socket };
});
jest.mock("../config", () => ({
    config: { bot_id: 1, username: "bot", min_move_time: 0, verbosity: 0 },
}));
jest.mock("../trace", () => ({
    trace: {
        log: jest.fn(),
        info: jest.fn(),
        trace: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));
jest.mock("../pools", () => ({
    bot_pools: {
        main: {
            acquire: jest.fn(),
            release: jest.fn(),
            clearLastGameId: jest.fn(),
            countAvailable: jest.fn(() => 1),
        },
        opening: null,
        ending: null,
    },
}));

import { Game } from "../Game";
import { socket } from "../socket";
import { bot_pools } from "../pools";
import { metrics } from "../metrics";

async function total(counter: { get(): Promise<{ values: { value: number }[] }> }) {
    return (await counter.get()).values.reduce((sum, v) => sum + v.value, 0);
}

const send = socket.send as unknown as jest.Mock;
const PASS = "..";
const ENGINE_MOVE = "dd";

/** Everything we've sent to the server for a given event */
function sent(event: string): any[] {
    return send.mock.calls.filter(([e]) => e === event).map(([, payload]) => payload);
}

let last_move_time = 1000;
function gamedata(overrides: any = {}): any {
    return {
        game_id: GAME_ID,
        phase: "play",
        width: 19,
        height: 19,
        handicap: 0,
        free_handicap_placement: false,
        komi: 7.5,
        rules: "chinese",
        initial_player: "black",
        moves: [],
        players: {
            black: { id: BOT_ID, username: "bot" },
            white: { id: OPPONENT_ID, username: "opponent" },
        },
        // The clock differs every time the server sends it, like the real thing
        clock: {
            current_player: BOT_ID,
            black_player_id: BOT_ID,
            white_player_id: OPPONENT_ID,
            last_move: ++last_move_time,
        },
        time_control: { speed: "live", system: "simple", per_move: 60 },
        ...overrides,
    };
}

async function settle(ms: number = 0): Promise<void> {
    await jest.advanceTimersByTimeAsync(ms);
}

async function serverSendsGamedata(overrides: any = {}): Promise<void> {
    (socket as any).emit(`game/${GAME_ID}/gamedata`, gamedata(overrides));
    await settle();
}

async function serverSendsMove(move_number: number, move: number[]): Promise<void> {
    (socket as any).emit(`game/${GAME_ID}/move`, { game_id: GAME_ID, move_number, move });
    await settle();
}

/** The server refuses our last move, then we wait long enough for any reconnect to happen */
async function serverRejectsMove(): Promise<void> {
    (socket as any).emit(
        `game/${GAME_ID}/error`,
        `Error: Move error in ${GAME_ID} on move number 1 at D16: illegal_board_repetition`,
    );
    await settle(1000);
}

/** The server refuses our move, and answers our reconnect with the unchanged position */
async function serverRejectsMoveAndResyncs(): Promise<void> {
    await serverRejectsMove();
    await serverSendsGamedata();
}

describe("Game: server rejects our move", () => {
    let game: Game;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.spyOn(console, "log").mockImplementation(() => undefined);

        const bot = {
            dead: false,
            bot_config: { release_delay: 0 },
            setGame: jest.fn(),
            verbose: jest.fn(),
            on: jest.fn(),
            off: jest.fn(),
            loadState: jest.fn().mockResolvedValue(""),
            getMoves: jest
                .fn()
                .mockResolvedValue([{ x: 3, y: 3, text: "d16", pass: false, resign: false }]),
        };
        (bot_pools.main.acquire as jest.Mock).mockResolvedValue(bot);

        game = new Game(GAME_ID);
    });

    afterEach(() => {
        game.disconnect();
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    test("plays the engine's move when it is our turn", async () => {
        await serverSendsGamedata();

        expect(sent("game/move")).toEqual([{ game_id: GAME_ID, move: ENGINE_MOVE }]);
    });

    test("reconnects to the game to re-sync when the server rejects our move", async () => {
        await serverSendsGamedata();
        send.mockClear();

        await serverRejectsMove();

        expect(send.mock.calls.map(([event]) => event)).toEqual([
            "game/disconnect",
            "game/connect",
        ]);
    });

    test("asks the engine for a move again after re-syncing", async () => {
        await serverSendsGamedata();
        await serverRejectsMoveAndResyncs();

        expect(sent("game/move")).toHaveLength(2);
    });

    test("passes instead of resigning when the server rejects our move three times in a row", async () => {
        await serverSendsGamedata();
        await serverRejectsMoveAndResyncs();
        await serverRejectsMoveAndResyncs();
        await serverRejectsMove();

        expect(sent("game/move").map((m) => m.move)).toEqual([
            ENGINE_MOVE,
            ENGINE_MOVE,
            ENGINE_MOVE,
            PASS,
        ]);
        expect(sent("game/resign")).toEqual([]);
    });

    test("tells the players in chat when it falls back to passing", async () => {
        await serverSendsGamedata();
        await serverRejectsMoveAndResyncs();
        await serverRejectsMoveAndResyncs();
        expect(sent("game/chat")).toEqual([]);

        await serverRejectsMove();

        expect(sent("game/chat")).toHaveLength(1);
        expect(sent("game/chat")[0].body).toMatch(/pass/i);
    });

    test("starts counting rejections from zero again once a move has been accepted", async () => {
        await serverSendsGamedata();
        await serverRejectsMoveAndResyncs();
        await serverRejectsMoveAndResyncs();
        // Third attempt is accepted, then the opponent replies and we move again
        await serverSendsMove(1, [3, 3, 1000]);
        await serverSendsMove(2, [15, 15, 1000]);
        send.mockClear();

        await serverRejectsMove();

        expect(send.mock.calls.map(([event]) => event)).toEqual([
            "game/disconnect",
            "game/connect",
        ]);
    });

    test("stops trying when even the fallback pass is rejected", async () => {
        await serverSendsGamedata();
        await serverRejectsMoveAndResyncs();
        await serverRejectsMoveAndResyncs();
        await serverRejectsMove();
        send.mockClear();

        await serverRejectsMove();

        expect(send).not.toHaveBeenCalled();
    });

    test("ignores server errors when we have no move awaiting confirmation", async () => {
        await serverSendsGamedata({
            clock: {
                current_player: OPPONENT_ID,
                black_player_id: BOT_ID,
                white_player_id: OPPONENT_ID,
                last_move: 1,
            },
        });
        send.mockClear();

        await serverRejectsMove();

        expect(send).not.toHaveBeenCalled();
    });

    test("counts a rejected move as a move rejection, not as a bot failure", async () => {
        await serverSendsGamedata();
        const rejections = await total(metrics.move_rejections);
        const failures = await total(metrics.bot_failures);

        await serverRejectsMove();

        expect((await total(metrics.move_rejections)) - rejections).toBe(1);
        expect((await total(metrics.bot_failures)) - failures).toBe(0);
    });

    test("makes the engine reload the position after a rejection", async () => {
        await serverSendsGamedata();
        (bot_pools.main.clearLastGameId as jest.Mock).mockClear();

        await serverRejectsMove();

        expect(bot_pools.main.clearLastGameId).toHaveBeenCalledWith(GAME_ID);
    });
});
