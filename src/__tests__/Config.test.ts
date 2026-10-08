if (!process.argv.includes("dummybot")) {
    process.argv.push("--", "dummybot");
}

import { validate_config } from "../config";

/* jsonschema falls back to `new URL(ref, "thismessage::/")` when a $ref
 * wasn't indexed up front. Node 26+ rejects relative refs against that base
 * with "Invalid URL" (#436), while older Node versions accept them, so make
 * the fallback fail everywhere to catch regressions on any Node version. */
const OriginalURL = globalThis.URL;
class StrictURL extends OriginalURL {
    constructor(url: string | URL, base?: string | URL) {
        if (typeof base === "string" && base.startsWith("thismessage:")) {
            throw new TypeError("Invalid URL");
        }
        super(url, base);
    }
}

const valid_bot = { command: ["dummybot"], release_delay: 100 };

describe("validate_config", () => {
    beforeEach(() => {
        globalThis.URL = StrictURL as typeof URL;
    });

    afterEach(() => {
        globalThis.URL = OriginalURL;
    });

    test("accepts a valid config without falling back to URL parsing", () => {
        const result = validate_config({
            apikey: "abc",
            bot: valid_bot,
            opening_bot: { ...valid_bot, number_of_opening_moves_to_play: 8 },
            ending_bot: { ...valid_bot, allowed_resigns: 3 },
            greeting: { en: "Hello" },
            allowed_time_control_systems: ["fischer", "byoyomi"],
            allowed_live_settings: {
                concurrent_games: 1,
                simple: { per_move_time_range: [10, 300] },
            },
            allowed_board_sizes: { width_range: [9, 19], height_range: [9, 19] },
        });
        expect(result.errors.map(String)).toEqual([]);
        expect(result.valid).toBe(true);
    });

    test("validates sections referenced through definitions", () => {
        const result = validate_config({
            apikey: "abc",
            bot: { command: "not-an-array", release_delay: 100 },
            greeting: "not-an-object",
        });
        expect(result.valid).toBe(false);
        expect(result.errors.map((e) => e.property)).toEqual(
            expect.arrayContaining(["instance.bot.command", "instance.greeting"]),
        );
    });
});
