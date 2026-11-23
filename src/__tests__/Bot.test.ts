import { EventEmitter } from "events";
import { PassThrough } from "stream";
import * as split2 from "split2";

jest.mock("child_process", () => ({ spawn: jest.fn() }));
jest.mock("../socket", () => ({ socket: { clock_drift: 0, send: jest.fn() } }));
jest.mock("../config", () => ({ config: { verbosity: 0 } }));
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
jest.mock("../pools", () => ({ bot_pools: {} }));

import { spawn } from "child_process";
import { Bot } from "../Bot";

const REQUIRED_COMMANDS = ["list_commands", "boardsize", "clear_board", "komi", "play", "genmove"];

/** Stands in for the engine process, answering GTP commands over fake pipes */
class FakeEngine extends EventEmitter {
    stdin = new PassThrough();
    stdout = new PassThrough();
    stderr = new PassThrough();
    pid = 4242;
    exitCode: number | null = null;
    received: string[] = [];
    failing_commands: string[] = [];

    constructor(extra_commands: string[]) {
        super();
        const commands = [...REQUIRED_COMMANDS, ...extra_commands];
        this.stdin.pipe(split2()).on("data", (data) => {
            const line = data.toString().trim();
            if (!line) {
                return;
            }
            this.received.push(line);
            const command = line.split(" ")[0];
            if (command === "list_commands") {
                this.stdout.write(`= ${commands.join("\n")}\n\n`);
            } else if (this.failing_commands.includes(command)) {
                this.stdout.write("? nope\n\n");
            } else {
                this.stdout.write("= \n\n");
            }
        });
    }

    /** Commands received with the given name, e.g. `kata-set-rules` */
    commands(name: string): string[] {
        return this.received.filter((line) => line.split(" ")[0] === name);
    }
}

function gamedata(rules: string): any {
    return {
        game_id: 123,
        width: 19,
        height: 19,
        komi: 7.5,
        rules,
        handicap: 0,
        free_handicap_placement: false,
        initial_player: "black",
        moves: [],
    };
}

async function startBot(extra_commands: string[]): Promise<[Bot, FakeEngine]> {
    const engine = new FakeEngine(extra_commands);
    (spawn as jest.Mock).mockReturnValue(engine);
    const bot = new Bot({ command: ["fake-engine"], manager: "pool" } as any);
    await bot.ready;
    return [bot, engine];
}

describe("Bot: telling the engine which rules the game uses", () => {
    test.each([
        // OGS enforces positional superko for Chinese rules, plain "chinese" is simple ko in KataGo
        ["chinese", "chinese-ogs"],
        ["japanese", "japanese"],
        ["korean", "korean"],
        ["aga", "aga"],
        ["ing", "ing"],
        ["nz", "new-zealand"],
    ])("a %s game sends kata-set-rules %s", async (ogs_rules, kata_rules) => {
        const [bot, engine] = await startBot(["kata-set-rules"]);

        await bot.loadState(gamedata(ogs_rules));

        expect(engine.commands("kata-set-rules")).toEqual([`kata-set-rules ${kata_rules}`]);
    });

    test.each([
        ["chinese", "chinese"],
        ["japanese", "japanese"],
        ["aga", "aga"],
        ["nz", "new_zealand"],
    ])("a %s game sends kgs-rules %s to engines without kata-set-rules", async (ogs, kgs) => {
        const [bot, engine] = await startBot(["kgs-rules"]);

        await bot.loadState(gamedata(ogs));

        expect(engine.commands("kgs-rules")).toEqual([`kgs-rules ${kgs}`]);
    });

    test.each(["korean", "ing"])("kgs-rules has no %s ruleset, so none is sent", async (rules) => {
        const [bot, engine] = await startBot(["kgs-rules"]);

        await bot.loadState(gamedata(rules));

        expect(engine.commands("kgs-rules")).toEqual([]);
    });

    test("prefers kata-set-rules when the engine supports both", async () => {
        const [bot, engine] = await startBot(["kgs-rules", "kata-set-rules"]);

        await bot.loadState(gamedata("chinese"));

        expect(engine.commands("kata-set-rules")).toHaveLength(1);
        expect(engine.commands("kgs-rules")).toEqual([]);
    });

    test("sends nothing for a ruleset we don't know", async () => {
        const [bot, engine] = await startBot(["kgs-rules", "kata-set-rules"]);

        await bot.loadState(gamedata("constructor"));

        expect(engine.commands("kata-set-rules")).toEqual([]);
        expect(engine.commands("kgs-rules")).toEqual([]);
    });

    test("sends no rules command to engines that support neither", async () => {
        const [bot, engine] = await startBot([]);

        await bot.loadState(gamedata("chinese"));

        expect(engine.received).toEqual([
            "list_commands",
            "boardsize 19",
            "clear_board",
            "komi 7.5",
        ]);
    });

    test("carries on loading the game when the engine refuses the rules", async () => {
        const [bot, engine] = await startBot(["kata-set-rules"]);
        engine.failing_commands = ["kata-set-rules"];

        await bot.loadState(gamedata("chinese"));

        expect(engine.commands("kata-set-rules")).toHaveLength(1);
        expect(engine.commands("komi")).toEqual(["komi 7.5"]);
    });

    test("does not count a refused rules command as a bot failure", async () => {
        const [bot, engine] = await startBot(["kata-set-rules"]);
        engine.failing_commands = ["kata-set-rules"];

        await bot.loadState(gamedata("chinese"));

        expect(bot.failed).toBe(false);
    });
});
