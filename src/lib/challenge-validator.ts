/** Challenge validation logic for bot configuration */

export interface RejectionDetails {
    message: string;
    rejection_code: string;
    details: { [key: string]: any };
}

export interface ChallengeNotification {
    user: { id: number; username: string };
    challenge_id: number;
    time_control: any;
    width: number;
    height: number;
    ranked: boolean;
    handicap: number;
    min_ranking: number;
    komi: number;
}

export class ChallengeValidator {
    private config: any;
    private countGamesCallback: (speed: string) => number;
    private countGamesForPlayerCallback: (player_id: number) => number;

    constructor(
        config: any,
        countGamesCallback: (speed: string) => number,
        countGamesForPlayerCallback: (player_id: number) => number,
    ) {
        this.config = config;
        this.countGamesCallback = countGamesCallback;
        this.countGamesForPlayerCallback = countGamesForPlayerCallback;
    }

    /** Check if challenge should be accepted or rejected */
    validateChallenge(notification: ChallengeNotification): RejectionDetails | undefined {
        // Check all criteria
        let reject: RejectionDetails | undefined =
            this.checkBlacklist(notification.user) ||
            this.checkTimeControl(notification.time_control) ||
            this.checkConcurrentGames(notification.time_control.speed) ||
            this.checkBoardSize(notification.width, notification.height) ||
            this.checkHandicap(notification.ranked, notification.handicap) ||
            this.checkRanked(notification.ranked) ||
            this.checkAllowedRank(notification.ranked, notification.min_ranking) ||
            this.checkDeclineChallenges() ||
            this.checkGamesPerPlayer(notification.user.id) ||
            this.checkKomi(notification.komi) ||
            undefined;

        // Whitelist overrides rejection
        if (this.checkWhitelist(notification.user)) {
            reject = undefined;
        }

        return reject;
    }

    private checkBlacklist(user: { id: number; username: string }): RejectionDetails | undefined {
        if (!this.config.blacklist) {
            return undefined;
        }
        if (
            this.config.blacklist.includes(user.id) ||
            this.config.blacklist.includes(user.username)
        ) {
            return {
                message: `The operator of this bot will not let you play against it.`,
                rejection_code: "blacklisted",
                details: {},
            };
        }
        return undefined;
    }

    private checkWhitelist(user: { id: number; username: string }): boolean {
        if (!this.config.whitelist) {
            return false;
        }
        return (
            this.config.whitelist.includes(user.id) ||
            this.config.whitelist.includes(user.username)
        );
    }

    private checkBoardSize(width: number, height: number): RejectionDetails | undefined {
        const allowed_sizes = this.config.allowed_board_sizes;
        if (!allowed_sizes) {
            return undefined;
        }

        // Handle explicit board size ranges
        if (
            typeof allowed_sizes === "object" &&
            "width_range" in allowed_sizes &&
            "height_range" in allowed_sizes
        ) {
            if (
                width < allowed_sizes.width_range[0] ||
                width > allowed_sizes.width_range[1] ||
                height < allowed_sizes.height_range[0] ||
                height > allowed_sizes.height_range[1]
            ) {
                return {
                    message:
                        `This bot only supports board sizes between ` +
                        `${allowed_sizes.width_range[0]}x${allowed_sizes.height_range[0]} ` +
                        `and ${allowed_sizes.width_range[1]}x${allowed_sizes.height_range[1]}.`,
                    rejection_code: "board_size_not_allowed",
                    details: {
                        width,
                        height,
                        width_range: allowed_sizes.width_range,
                        height_range: allowed_sizes.height_range,
                    },
                };
            }
            return undefined;
        }

        // Handle normal sizes or special "all" | "square" cases
        const allowed = Array.isArray(allowed_sizes) ? allowed_sizes : [allowed_sizes];

        if (allowed.includes("all")) {
            return undefined;
        }

        if (allowed.includes("square") && width === height) {
            return undefined;
        }

        if (width !== height) {
            return {
                message: `This bot only plays square boards.`,
                rejection_code: "board_size_not_square",
                details: { width, height },
            };
        }

        if (!allowed.includes(width)) {
            return {
                message: `This bot only plays on these board sizes: ${allowed
                    .map((x) => `${x}x${x}`)
                    .join(", ")}.`,
                rejection_code: "board_size_not_allowed",
                details: { width, height },
            };
        }

        return undefined;
    }

    private checkHandicap(ranked: boolean, handicap: number): RejectionDetails | undefined {
        const allow_handicap = ranked
            ? this.config.allow_ranked_handicap
            : this.config.allow_unranked_handicap;

        if (!allow_handicap && handicap !== 0) {
            return {
                message: `This bot only plays games with no handicap.`,
                rejection_code: "handicap_not_allowed",
                details: { handicap },
            };
        }
        return undefined;
    }

    private checkRanked(ranked: boolean): RejectionDetails | undefined {
        if (!ranked && this.config.allow_unranked === false) {
            return {
                message: `This bot only plays ranked games.`,
                rejection_code: "unranked_not_allowed",
                details: { ranked },
            };
        }

        if (ranked && this.config.allow_ranked === false) {
            return {
                message: `This bot only plays unranked games.`,
                rejection_code: "ranked_not_allowed",
                details: { ranked },
            };
        }

        return undefined;
    }

    private checkConcurrentGames(speed: string): RejectionDetails | undefined {
        const count = this.countGamesCallback(speed);
        const settings_map: { [key: string]: string } = {
            blitz: "allowed_blitz_settings",
            rapid: "allowed_rapid_settings",
            live: "allowed_live_settings",
            correspondence: "allowed_correspondence_settings",
        };

        const settings_key = settings_map[speed];
        if (!settings_key) {
            return undefined;
        }

        const settings = this.config[settings_key];
        if (!settings?.concurrent_games) {
            return {
                message: `This bot does not play ${speed} games.`,
                rejection_code: `${speed}_not_allowed`,
                details: {},
            };
        }

        if (count >= settings.concurrent_games) {
            return {
                message: `This bot is already playing ${count} of ${settings.concurrent_games} allowed ${speed} games.`,
                rejection_code: `too_many_${speed}_games`,
                details: {
                    count,
                    allowed: settings.concurrent_games,
                },
            };
        }

        return undefined;
    }

    private checkTimeControl(time_control: any): RejectionDetails | undefined {
        // Basic validation - full validation would match CLI logic
        // For now, just check if system is allowed
        const allowed_systems = this.config.allowed_time_control_systems || [
            "fischer",
            "byoyomi",
            "simple",
        ];
        if (!allowed_systems.includes(time_control.system)) {
            return {
                message: `This bot only plays games with time control system ${allowed_systems.join(", ")}.`,
                rejection_code: "time_control_system_not_allowed",
                details: { time_control_system: time_control.system },
            };
        }
        return undefined;
    }

    private checkAllowedRank(game_is_ranked: boolean, player_rank: number): RejectionDetails | undefined {
        if (!game_is_ranked) {
            return undefined;
        }

        const rank_range = this.config.allowed_rank_range;
        if (!rank_range) {
            return undefined;
        }

        const min_rank = this.rankstr_to_number(rank_range[0]);
        const max_rank = this.rankstr_to_number(rank_range[1]);

        if (player_rank < min_rank || player_rank > max_rank) {
            return {
                rejection_code: "player_rank_out_of_range",
                details: {
                    allowed_rank_range: rank_range,
                },
                message:
                    player_rank < min_rank
                        ? `Your rank is too low to play against this bot.`
                        : `Your rank is too high to play against this bot.`,
            };
        }
        return undefined;
    }

    private checkDeclineChallenges(): RejectionDetails | undefined {
        if (this.config.decline_new_challenges) {
            return {
                rejection_code: "not_accepting_new_challenges",
                details: {},
                message: "This bot is not accepting new challenges at this time.",
            };
        }
        return undefined;
    }

    private checkKomi(komi: number): RejectionDetails | undefined {
        const komi_range = this.config.allowed_komi_range;
        if (!komi_range) {
            return undefined;
        }

        if (komi < komi_range[0] || komi > komi_range[1]) {
            return {
                rejection_code: "komi_out_of_range",
                details: {
                    allowed_komi_range: komi_range,
                },
                message: `Komi is out of acceptable range`,
            };
        }
        return undefined;
    }

    private checkGamesPerPlayer(player_id: number): RejectionDetails | undefined {
        if (!this.config.max_games_per_player) {
            return undefined;
        }

        const game_count = this.countGamesForPlayerCallback(player_id);

        if (game_count >= this.config.max_games_per_player) {
            return {
                rejection_code: "too_many_games_for_player",
                details: {
                    games_being_played: game_count,
                    max_games_per_player: this.config.max_games_per_player,
                },
                message: `You already have ${game_count} games against this bot. This bot only allows ${this.config.max_games_per_player} games per player, please end your other games before starting a new one.`,
            };
        }
        return undefined;
    }

    private rankstr_to_number(rank: string): number {
        const base = parseInt(rank);
        const suffix = rank[rank.length - 1].toLowerCase();

        switch (suffix) {
            case "p":
                return 999;
            case "k":
                return 30 - base;
            case "d":
                return 29 + base;
        }

        throw new Error(`Invalid rank string: ${rank}`);
    }
}
