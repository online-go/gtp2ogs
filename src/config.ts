import * as fs from "fs";
import * as JSON5 from "json5";
import * as yargs from "yargs";
import * as ConfigSchema from "../schema/Config.schema.json";
import { Validator } from "jsonschema";

type BotTimeControlSystems = "fischer" | "byoyomi" | "simple";

/** Bot config */
export interface Config {
    /** API key for the bot. */
    apikey: string;

    /** Enable verbose logging.
     *  @values 0-2
     *  @default 0
     */
    verbosity?: number;

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

    /** Message to send to your opponent at the start of the game */
    greeting?: TranslatableString;
    farewell?: TranslatableString;

    resign_bot?: BotConfig;
    opening_bot?: BotConfig;

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
     * can enable it by providing accetpable time settings.
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
     *  @default [9, 13, 19]
     */
    allowed_board_sizes?: number[] | (number | "all" | "square");

    /** Allowed unranked games
     *  @default true
     */
    allow_unranked?: boolean;

    /** +- the number of ranks allowed to play against this bot. Note that
     * ranked games are always limited to +-9. 0 to disable rank restrictions.
     * @default 0
     */
    allowed_rank_range?: number;

    /** Allow handicap games
     *  @default true
     */
    allow_handicap?: boolean;

    /** Minimum rank to accept games from
     * @default 0
     * @minimum 0
     * @maximum 35
     */
    min_rank?: number;

    /** Hide the bot from the public bot list
     * @default false
     */
    hidden?: boolean;

    /** Used for debugging, will issue a showboard command when we've loaded
     * the board state into the bot
     * @default false
     */
    showboard?: boolean;

    /* Old */
    aichat?: boolean;
    ogspv?: boolean;

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
}

export interface TimeControlRanges {
    /** Range of acceptable times per move. This is:
     *    - The period time in byo-yomi
     *    - The time increment and minimum move time in Fischer
     *    - The time per move in simple time
     *
     * @default [10, 300] for live, [43200, 259200] for correspondence
     */
    per_move_time_range: [number, number];

    /** Range of acceptable main times in seconds. This is only applicable for byo-yomi
     * @default [0, 3600] for live games, [0, 86400] for correspondence games
     */
    main_time_range: [number, number];

    /** Range of acceptable number of periods. This is only applicable for byo-yomi
     *  @default [1, 10]
     */
    periods_range: [number, number];
}

export interface TranslatableString {
    en: string;
    [lang: string]: string;
}

/** Bot config */
export interface BotConfig {
    command: string[];
    instances?: number;
    pv_format?: string;

    /** Disables clocks being sent to the bot. Clocks will only be sent when
     * the applicable clock commands are detected from the bot anyways, so this
     * is generally unnecessary.
     *
     * @default false
     */
    disable_clock?: boolean;
}

function defaults(): Config {
    return {
        apikey: "",
        server: "https://online-go.com",
        min_rank: 0,
        verbosity: 1,
        max_pause_time: 300,
        allowed_time_control_systems: ["fischer", "byoyomi", "simple"],
        allowed_blitz_settings: null,
        allowed_live_settings: {
            per_move_time_range: [10, 300],
            main_time_range: [0, 3600],
            periods_range: [1, 10],
        },
        allowed_correspondence_settings: {
            per_move_time_range: [43200, 259200],
            main_time_range: [0, 86400],
            periods_range: [1, 10],
        },

        allowed_board_sizes: [9, 13, 19],
        allow_unranked: true,
        allowed_rank_range: 0,
        allow_handicap: true,
        hidden: false,

        greeting: {
            en: "Hello, I am a bot. Good luck, have fun!",
            fr: "Bonjour, je suis un bot. Bonne chance, amusez-vous bien!",
            de: "Hallo, ich bin ein Bot. Viel Glück, viel Spaß!",
            es: "Hola, soy un bot. ¡Buena suerte, que te diviertas!",
            it: "Ciao, sono un bot. Buona fortuna, divertiti!",
            ja: "こんにちは、私はボットです。 お疲れ様でした、楽しんでください！",
            ko: "안녕하세요, 저는 봇입니다. 행운을 빕니다, 즐거운 시간 되세요!",
            nl: "Hallo, ik ben een bot. Veel geluk, veel plezier!",
            pl: "Cześć, jestem botem. Powodzenia, baw się dobrze!",
            pt: "Olá, eu sou um bot. Boa sorte, divirta-se!",
            ru: "Привет, я бот. Удачи, приятной игры!",
            "zh-tw": "大家好，我是機器人。 祝你好運，玩得開心！",
            "zh-cn": "大家好，我是机器人。 祝你好运，玩得开心！",
        },

        farewell: {
            en: "Thank you for the game!",
            fr: "Merci pour la partie!",
            de: "Danke für das Spiel!",
            es: "¡Gracias por el juego!",
            it: "Grazie per la partita!",
            ja: "ゲームありがとうございました！",
            ko: "게임 감사합니다!",
            nl: "Bedankt voor het spel!",
            pl: "Dziękuję za grę!",
            pt: "Obrigado pelo jogo!",
            ru: "Спасибо за игру!",
            "zh-tw": "謝謝你的遊戲！",
            "zh-cn": "谢谢你的游戏！",
        },
    };
}

function bot_config_defaults(): Partial<BotConfig> {
    return {
        instances: 1,
    };
}

export const config: Config = load_config_or_exit();

function load_config_or_exit(): Config {
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
        .describe("apikey", "API key for the bot")
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
    };

    const cli_bot_command = args._.length > 0 ? args._ : undefined;

    for (const key of Object.keys(from_cli)) {
        if (from_cli[key] === undefined) {
            delete from_cli[key];
        }
    }

    const filename = args.config;

    /* eslint-disable-next-line @typescript-eslint/no-var-requires */
    const contents = filename ? fs.readFileSync(filename, "utf8") : "{}";
    const raw = JSON5.parse(contents);
    const with_defaults = { ...defaults(), ...raw, ...from_cli };

    if (cli_bot_command) {
        if (!("bot" in with_defaults)) {
            with_defaults.bot = {
                command: cli_bot_command,
            };
        } else {
            with_defaults.bot.command = cli_bot_command;
        }
    }

    if (with_defaults.bot) {
        with_defaults.bot = { ...bot_config_defaults(), ...with_defaults.bot };
    }
    if (with_defaults.resign_bot) {
        with_defaults.resign_bot = {
            ...bot_config_defaults(),
            ...with_defaults.resign_bot,
        };
    }
    if (with_defaults.opening_bot) {
        with_defaults.opening_bot = {
            ...bot_config_defaults(),
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

        process.exit(1);
    }
    //console.info(yargs.argv);
    //console.info(with_defaults);

    return with_defaults;
}
