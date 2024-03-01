import * as fs from "fs";
import * as JSON5 from "json5";
import * as yargs from "yargs";
import * as ConfigSchema from "../schema/Config.schema.json";
import { Validator } from "jsonschema";
import { EventEmitter } from "eventemitter3";

export interface Events {
    reloaded: () => void;
}

export const config_event_emitter = new EventEmitter<Events>();
export type BotTimeControlSystems = "fischer" | "byoyomi" | "simple";

/** Bot config */
export interface Config {
    /** API key for the bot. */
    apikey: string;

    /** Engine specifier of the bot, this is a plain text description of the
     * bot's engine and network that will be recorded along with all games
     * played. */
    engine?: string;

    /** Enable verbose logging.
     *  @values 0-2
     *  @default 0
     */
    verbosity?: number;

    /** Sets how often the status lines are printed to the screen. Set to 0 to
     * disable.
     * units: milliseconds
     * @default 60000
     */
    status_update_frequency?: number;

    /**
     * Server URL to connect to, defaults to online-go.com
     * @default https://online-go.com
     */
    server?: string;

    /** Maximum time to allow the game to be paused for in seconds.
     * @default 300
     * @range 300 - 172800
     */
    max_pause_time?: number;

    /** Players who are not allowed to play the bot ever. */
    blacklist?: (number | string)[];

    /** Players who are allowed to challenge the bot with any settings even
     * when the bot is at the maximum number of simultaneous games */
    whitelist?: (number | string)[];

    /** Config for how to run your bot */
    bot?: BotConfig;

    /** Bot to use for playing opening moves. This can be useful for ensuring
     * your bot plays at least a few reasonable joseki moves if it is a weak
     * bot. */
    opening_bot?: OpeningBotConfig;

    /** Secondary bot to use for ensuring your real bot passes or resigns
     * appropriately. This bot will be consulted every move after . If the move it
     * returns is a pass it will override the move your bot has made (unless
     * your bot is resigning). If the move it returns is a resign, it will
     * count the number of successive resigns and if it is more than the number
     * of allowed resigns you've set in this config (default of 3), it will
     * override your bot's move with a resign.
     */
    ending_bot?: EndingBotConfig;

    /** Message to send to the player at the start of the game */
    greeting?: TranslatableString;

    /** Message to send to the player when the game is over */
    farewell?: TranslatableString;

    /** Send a message saying what the bot thought the score was at the end of the game */
    farewellscore?: boolean;

    /** File to write logs to. Logs will be sent to stdout as well. */
    logfile?: string;

    /** Time control systems that we can work with
     *  @default ["fischer", "byoyomi", "simple"]
     *  @allowedValues ["fischer", "byoyomi", "simple"]
     *  @minItems 1
     */
    allowed_time_control_systems?: BotTimeControlSystems[];

    /**
     * Allowed blitz times for the bot. Blitz is disabled by default, but you
     * can enable it by providing acceptable time settings.
     *
     * @default null
     */
    allowed_blitz_settings?: null | TimeControlRanges;

    /** Allowed live game times for bot.
     *
     *  @default {"per_move_time_range": [10, 300], "main_time_range": [0, 3600], "periods_range": [1, 10]}
     */
    allowed_live_settings?: null | TimeControlRanges;

    /** Allowed correspondence game times for bot.
     *
     *  @default {"per_move_time_range": [43200, 259200], "main_time_range": [0, 86400], "periods_range": [1, 10]}
     */
    allowed_correspondence_settings?: null | TimeControlRanges;

    /** Allowed board sizes for the bot. If there are no restrictions, you can
     *  provide "all", or if you can play on any square board, you can provide "square".
     *
     *  You can also provide explicit width and height ranges for non square boards
     *  with `{width_range: [min, max], height_range: [min, max]}`.
     *
     *  @default [9, 13, 19]
     */
    allowed_board_sizes?: number[] | (number | "all" | "square") | BoardSizeRanges;

    /** Allowed ranked games
     *  @default true
     */
    allow_ranked?: boolean;

    /** Allowed unranked games
     *  @default true
     */
    allow_unranked?: boolean;

    /** Allowed range for ranked games
     * @default ["30k", "9p"]
     */
    allowed_rank_range?: [string, string];

    /** Allow handicap games for ranked games
     *  @default true
     */
    allow_ranked_handicap?: boolean;

    /** Allow handicap games for unranked games
     *  @default true
     */
    allow_unranked_handicap?: boolean;

    /** Allowed komi range. Negative numbers indicate reverse Komi.
     *  @default [-99, 99]
     */
    allowed_komi_range?: [number, number];

    /** Hide the bot from the public bot list
     * @default false
     */
    hidden?: boolean;

    /** Decline all new challenges. This implies hidden.
     * @default false
     */
    decline_new_challenges?: boolean;

    /** Used for debugging, will issue a showboard command when we've loaded
     * the board state into the bot
     * @default false
     */
    showboard?: boolean;

    /** If set, bot moves will be delayed when made before `min_move_time` ms.
     * This is primarily a user experience thing as can make players feel rushed
     * if the bots are responding too quickly.
     *
     * @default 1500
     */
    min_move_time?: number;

    /** Maximum amount of ongoing games to allow concurrently by the same player
     * @default 1
     */
    max_games_per_player?: number;

    /**********/
    /* Hidden */
    /**********/
    /** Bot username. This is automatically set when the bot authenticates with the API Key.
     * @hidden
     */
    username?: string;

    /** Bot ID. This is automatically set when the bot authenticates with the API key.
     * @hidden
     */
    bot_id?: number;

    /** Config version for internal use
     * @hidden
     */
    _config_version?: number;
}

export interface TimeControlRanges {
    /** Time control settings for Simple clocks */
    simple?: {
        /** Range of acceptable times per period in seconds
         * @default [10, 300] for live, [43200, 259200] for correspondence
         */
        per_move_time_range: [number, number];
    };

    /** Time control settings for byo-yomi clocks */
    byoyomi?: {
        /** Range of acceptable main times in seconds.
         * @default [0, 3600] for live games, [0, 259200] for correspondence games
         */
        main_time_range: [number, number];

        /** Range of acceptable times per period in seconds
         * @default [10, 300] for live, [43200, 259200] for correspondence
         */
        period_time_range: [number, number];

        /** Range of acceptable number of periods.
         *  @default [1, 10]
         */
        periods_range: [number, number];
    };

    /** Time control settings for fischer clocks */
    fischer?: {
        /** Range of acceptable main times in seconds.
         * @default [30, 600] for live games, [86400, 604800] for correspondence games
         */
        max_time_range: [number, number];

        /** range of acceptable times for the time increment
         * @default [10, 300] for live, [43200, 259200] for correspondence
         */
        time_increment_range: [number, number];
    };

    /** Concurrent games to allow for this speed bracket
     * @default 1, 3, 500 for blitz, live, correspondence respectively
     */
    concurrent_games: number;
}

/** Range of acceptable custom board sizes */
export interface BoardSizeRanges {
    /** Specify the low and high range of acceptable board widths. This value
     * is inclusive, so [5,19] would include 5, 19, and everything in between.
     */
    width_range: [number, number];
    /** Specify the low and high range of acceptable board heights. This value
     * is inclusive, so [5,19] would include 5, 19, and everything in between.
     */
    height_range: [number, number];
}

export interface TranslatableString {
    en: string;
    [lang: string]: string;
}

/** Bot config */
export interface BotConfig {
    command: string[];

    /** Management method for managing bot instances. `pool` starts up
     *  a fixed `instances` number of bots and and reuses them for all
     *  games. `persistent` starts up a single bot instance per game
     *  and allows state re-use to allow things like pondering.
     *
     *  @default "persistent"
     */
    manager?: "pool" | "persistent";

    /** Number of instances of the bot to run in parallel. Exactly this many
     *  instances will be run at any given time, regardless of how many ongoing
     *  games there are. This is only applicable when using the pooling manager.
     *
     *  @default 1
     */
    instances?: number;

    /** Enabled clocks being sent to the bot. Clocks will only be sent when
     * the applicable clock commands are detected from the bot anyways, so this
     * is generally fine to leave turned on.
     *
     * @default true
     */
    enable_clock?: boolean;

    /* Send chats that are output by the bot to the game chat
     *
     * Game chats are scanned for by looking at the STDERR output of the bot
     * client and looking for lines that start with `MALKOVICH: ` or
     * `DISCUSSION: ` or `MAIN: `. Note, MAIN and DISCUSSION are synonyms.
     *
     * @default true
     */
    send_chats?: boolean;

    /** Send the principal variation (PV) values. Note that your bot must output this
     * data in a way that can be parsed.
     *
     * @default true
     */
    send_pv_data?: boolean;

    /** After a bot makes a move, some bots will continue writing to stderr
     *  relevant information (such as chats or PV data). This option controls
     *  how long we wait for the bot to finish writing to stderr before we
     *  release the bot back into the pool of available bots.
     *
     *  @unit milliseconds
     *  @default 100
     */
    release_delay: number;

    /** When a bot is to shutdown we send a `quit` command to the bot.
     *  This grace period is the number of milliseconds to wait for the bot to
     *  quit gracefully before sending a `SIGTERM` to the bot. Furthermore,
     *  if the bot doesn't terminate after the `SIGTERM` for another grace
     *  period, we will send a `SIGKILL` to the bot.
     *
     *  @unit milliseconds
     *  @default 5000
     */
    quit_grace_period?: number;

    /** When the manager is set to "persistent", If no moves are made within
     *  this timeout, the bot process is terminated. If a new move is made
     *  a new process will be started to resume playing the game.
     *
     *  @unit milliseconds
     *  @default 600000   // 10 minutes
     */
    persistent_idle_timeout?: number;
}

export interface EndingBotConfig extends BotConfig {
    /** Number of successive resigns allowed before the bot will resign.
     * @default 3
     */
    allowed_resigns?: number;

    /** This is the ratio of the board size to the number of moves
     * to allow before we will start checking the ending bot for
     * passes and resigns. This is to prevent the bot from resigning
     * too early in a game.
     *
     * The move to start consulting the ending bot is calculated by taking
     *
     *    ceil(board_height * board_width * ratio)
     *
     * @allowed 0.1 - 1.0
     * @default 0.8
     */
    moves_to_allow_before_checking_ratio?: number;
}

export interface OpeningBotConfig extends BotConfig {
    /** Number of opening moves to play before switching to the main bot.
     * @default 8
     */
    number_of_opening_moves_to_play?: number;
}

function defaults(): Config {
    return {
        apikey: "",
        server: "https://online-go.com",
        verbosity: 1,
        max_pause_time: 300,
        status_update_frequency: 60000,
        allowed_time_control_systems: ["fischer", "byoyomi", "simple"],
        allowed_blitz_settings: null,
        allowed_live_settings: {
            simple: {
                per_move_time_range: [10, 300],
            },

            byoyomi: {
                main_time_range: [0, 3600],
                period_time_range: [10, 300],
                periods_range: [1, 10],
            },

            fischer: {
                max_time_range: [30, 600],
                time_increment_range: [10, 300],
            },

            concurrent_games: 3,
        },
        allowed_correspondence_settings: {
            simple: {
                per_move_time_range: [43200, 604800],
            },

            byoyomi: {
                main_time_range: [0, 604800],
                period_time_range: [43200, 604800],
                periods_range: [1, 10],
            },

            fischer: {
                max_time_range: [86400, 604800],
                time_increment_range: [43200, 604800],
            },
            concurrent_games: 500,
        },

        allowed_board_sizes: [9, 13, 19],
        allow_ranked: true,
        allow_unranked: true,
        allowed_rank_range: ["30k", "9p"],
        allow_ranked_handicap: true,
        allow_unranked_handicap: true,
        allowed_komi_range: [-99, 99],
        hidden: false,
        decline_new_challenges: false,
        min_move_time: 1500,
        max_games_per_player: 1,

        greeting: {
            en: "Hello, I am a bot. Good luck, have fun!",
            fr: "Bonjour, je suis un bot. Bonne chance, amusez-vous bien!", // cspell: disable-line
            de: "Hallo, ich bin ein Bot. Viel Glück, viel Spaß!", // cspell: disable-line
            es: "Hola, soy un bot. ¡Buena suerte, que te diviertas!", // cspell: disable-line
            it: "Ciao, sono un bot. Buona fortuna, divertiti!", // cspell: disable-line
            ja: "こんにちは、私はボットです。 お疲れ様でした、楽しんでください！",
            ko: "안녕하세요, 저는 봇입니다. 행운을 빕니다, 즐거운 시간 되세요!",
            nl: "Hallo, ik ben een bot. Veel geluk, veel plezier!", // cspell: disable-line
            pl: "Cześć, jestem botem. Powodzenia, baw się dobrze!", // cspell: disable-line
            pt: "Olá, eu sou um bot. Boa sorte, divirta-se!", // cspell: disable-line
            ru: "Привет, я бот. Удачи, приятной игры!", // cspell: disable-line
            "zh-tw": "大家好，我是機器人。 祝你好運，玩得開心！",
            "zh-cn": "大家好，我是机器人。 祝你好运，玩得开心！",
        },

        farewell: {
            en: "Thank you for the game!",
            fr: "Merci pour la partie!", // cspell: disable-line
            de: "Danke für das Spiel!", // cspell: disable-line
            es: "¡Gracias por el juego!", // cspell: disable-line
            it: "Grazie per la partita!", // cspell: disable-line
            ja: "ゲームありがとうございました！",
            ko: "게임 감사합니다!",
            nl: "Bedankt voor het spel!", // cspell: disable-line
            pl: "Dziękuję za grę!", // cspell: disable-line
            pt: "Obrigado pelo jogo!", // cspell: disable-line
            ru: "Спасибо за игру!", // cspell: disable-line
            "zh-tw": "謝謝你的遊戲！",
            "zh-cn": "谢谢你的游戏！",
        },
    };
}

function bot_config_defaults(): Partial<BotConfig> {
    const base: Partial<BotConfig> = {
        manager: "persistent",
        instances: 1,
        send_chats: true,
        send_pv_data: true,
        release_delay: 100,
        quit_grace_period: 5000,
        persistent_idle_timeout: 600000,
    };

    return base;
}

function ending_bot_config_defaults(): Partial<BotConfig> {
    const base: Partial<EndingBotConfig> = {
        ...bot_config_defaults(),
        allowed_resigns: 3,
        moves_to_allow_before_checking_ratio: 0.8,
    };

    return base;
}

function opening_bot_config_defaults(): Partial<BotConfig> {
    const base: Partial<OpeningBotConfig> = {
        ...bot_config_defaults(),
        number_of_opening_moves_to_play: 8,
    };

    return base;
}

export let config: Config = try_load_config();

function try_load_config(): Config {
    try {
        return load_config_or_throw();
    } catch (e) {
        console.error("Error loading config file:", e.message);
        process.exit(1);
    }
}

let reload_debounce = null;
function reload_config(config_path: string): void {
    if (reload_debounce) {
        return;
    }
    console.info("Reloading config file ", config_path);
    reload_debounce = setTimeout(() => {
        reload_debounce = null;
        try {
            config = load_config_or_throw();
            config_event_emitter.emit("reloaded");
        } catch (e) {
            console.error("Error loading config file:", e.message);
            return;
        }
    }, 100);
}

function load_config_or_throw(): Config {
    yargs(process.argv.slice(2))
        .usage("# Usage: $0 -c <config.json5> [options]")
        .usage("#        $0 -c <config.json5> [options] -- <bot command>")
        .describe(
            "server",
            "URL of the OGS server to connect to, defaults to https://online-go.com",
        )
        .describe(
            "beta",
            "Connect to the beta server. Overrides --server to https://beta.online-go.com",
        )
        .describe("config", "Path to configuration file")
        .alias("config", "c")
        .describe(
            "disable-status-updates",
            "Disable the status update lines printed to the console",
        )
        .alias("disable-status-updates", "q")
        .describe("apikey", "API key for the bot")
        .describe("engine", "Version of the bot engine being used")
        .describe("v", "Increase level (use multiple times for more logs)")
        .count("v")
        .strict()
        .parseSync();

    const args: { [k: string]: any } = yargs.argv;

    if (args.beta) {
        args.server = "https://beta.online-go.com";
    }

    const from_cli: Partial<Config> = {
        server: args.server,
        apikey: args.apikey,
        verbosity: args.v || undefined,
        status_update_frequency: args.q ? 0 : undefined,
        engine: args.engine,
    };

    let cli_bot_command = args._.length > 0 ? args._ : undefined;

    for (const key of Object.keys(from_cli)) {
        if (from_cli[key] === undefined) {
            delete from_cli[key];
        }
    }

    const filename = args.config;

    if (filename) {
        fs.watch(filename, () => {
            reload_config(filename);
        });
    }

    /* eslint-disable-next-line @typescript-eslint/no-var-requires */
    const contents = filename ? fs.readFileSync(filename, "utf8") : "{}";
    const raw = JSON5.parse(contents);
    const with_defaults = { ...defaults(), ...raw, ...from_cli };

    if (cli_bot_command) {
        cli_bot_command = cli_bot_command.map((x: string | number) => x.toString().trim());

        if (!("bot" in with_defaults)) {
            with_defaults.bot = {
                ...bot_config_defaults(),
                command: cli_bot_command,
            };
        } else {
            with_defaults.bot.command = cli_bot_command;
        }
    }
    if (!("bot" in with_defaults)) {
        throw new Error("No bot configuration found");
    }

    if (with_defaults.allowed_blitz_settings) {
        if (!with_defaults.allowed_blitz_settings.concurrent_games) {
            with_defaults.allowed_blitz_settings.concurrent_games = 1;
        }
    }

    if (raw.allowed_live_settings) {
        with_defaults.allowed_live_settings = {
            ...defaults().allowed_live_settings,
            ...raw.allowed_live_settings,
        };
    }
    if (raw.allowed_correspondence_settings) {
        with_defaults.allowed_correspondence_settings = {
            ...defaults().allowed_correspondence_settings,
            ...raw.allowed_correspondence_settings,
        };
    }

    if (with_defaults.bot) {
        with_defaults.bot = { ...bot_config_defaults(), ...with_defaults.bot };
    }
    if (with_defaults.ending_bot) {
        with_defaults.ending_bot = {
            ...ending_bot_config_defaults(),
            ...with_defaults.ending_bot,
        };
    }
    if (with_defaults.opening_bot) {
        with_defaults.opening_bot = {
            ...opening_bot_config_defaults(),
            ...with_defaults.opening_bot,
        };
    }

    const validator = new Validator();
    const result = validator.validate(with_defaults, ConfigSchema);

    if (!result.valid) {
        console.error(``);
        console.error(``);
        console.error(`Invalid config file: ${filename}`);

        for (const error of result.errors) {
            console.error(`\t ${error.toString()}`);
        }
        console.error(``);
        console.error(``);

        throw new Error("Invalid config file");
    }
    //console.info(yargs.argv);
    //console.info(with_defaults);

    with_defaults._config_version = 1;

    return sanity_check_and_patch_config(with_defaults);
}

function sanity_check_and_patch_config(config: Config): Config {
    if (config.decline_new_challenges) {
        console.warn("Declining new challenges, hiding bot");
        config.hidden = true;
    }

    return config;
}
