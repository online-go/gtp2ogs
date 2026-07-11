(global as any).WebSocket = undefined;
process.argv.push("--", "dummybot");

jest.mock("../socket", () => ({
    socket: {
        on: jest.fn(),
        send: jest.fn(),
        connect: jest.fn(),
        disconnect: jest.fn(),
    },
}));

import { Main } from "../main";
import { config } from "../config";

type Notification = Parameters<Main["evaluateChallenge"]>[0];

const buildBenignNotification = (): Notification => ({
    type: "challenge",
    challenge_id: 1,
    user: { id: 42, username: "challenger", ranking: 25 },
    ranked: false,
    handicap: 0,
    komi: null,
    width: 19,
    height: 19,
    time_control: { system: "simple", speed: "live", per_move: 60 },
});

describe("Main.evaluateChallenge", () => {
    let main: Main;

    beforeEach(() => {
        main = new Main();

        config.blacklist = undefined;
        config.whitelist = undefined;
        config.allowed_board_sizes = [19];
        config.allow_ranked_handicap = true;
        config.allow_unranked_handicap = true;
        config.allow_unranked = true;
        config.allowed_time_control_systems = ["fischer", "byoyomi", "simple"];
        config.allowed_blitz_settings = undefined;
        config.allowed_rapid_settings = undefined;
        config.allowed_live_settings = {
            concurrent_games: 1,
            simple: { per_move_time_range: [10, 3600] },
        };
        config.allowed_correspondence_settings = undefined;
        config.allowed_rank_range = ["30k", "9p"];
        config.decline_new_challenges = false;
        config.max_games_per_player = 100;
        config.allowed_komi_range = [null, null];
    });

    test("accepts a benign challenge inside all configured ranges", () => {
        const result = main.evaluateChallenge(buildBenignNotification());
        expect(result).toBeUndefined();
    });

    // The bug this suite was written to catch: the call site was passing
    // notification.min_ranking (never populated) instead of the challenger's
    // rank, so the rank check silently allowed every challenger through.
    test("rejects a challenge whose challenger rank is below allowed_rank_range on a ranked game", () => {
        config.allowed_rank_range = ["5k", "9p"];
        const notification = buildBenignNotification();
        notification.ranked = true;
        notification.user.ranking = 5; // ~25k, well below 5k

        const result = main.evaluateChallenge(notification);
        expect(result?.rejection_code).toBe("player_rank_out_of_range");
    });

    test("rejects a challenge whose challenger rank is missing on a ranked game", () => {
        config.allowed_rank_range = ["5k", "9p"];
        const notification = buildBenignNotification();
        notification.ranked = true;
        notification.user.ranking = undefined; // unranked or missing

        const result = main.evaluateChallenge(notification);
        expect(result?.rejection_code).toBe("player_rank_out_of_range");
    });

    test("rejects a blacklisted challenger", () => {
        config.blacklist = [42];
        const result = main.evaluateChallenge(buildBenignNotification());
        expect(result?.rejection_code).toBe("blacklisted");
    });

    test("rejects a challenge on a disallowed board size", () => {
        const notification = buildBenignNotification();
        notification.width = 13;
        notification.height = 13;

        const result = main.evaluateChallenge(notification);
        expect(result?.rejection_code).toBe("board_size_not_allowed");
    });

    test("rejects any challenge when decline_new_challenges is set", () => {
        config.decline_new_challenges = true;
        const result = main.evaluateChallenge(buildBenignNotification());
        expect(result?.rejection_code).toBe("not_accepting_new_challenges");
    });

    test("whitelisted challenger bypasses rejection", () => {
        config.decline_new_challenges = true;
        config.whitelist = [42];
        const result = main.evaluateChallenge(buildBenignNotification());
        expect(result).toBeUndefined();
    });
});
