import * as fs from "fs";
import * as JSON5 from "json5";
import * as yargs from "yargs";
import * as ConfigSchema from "../schema/Config.schema.json";
import { Validator } from "jsonschema";

/** Bot config */
export interface Config {
    /** API key for the bot. */
    apikey: string;

    /** Enable verbose logging */
    verbosity?: number;

    /**
     * Server URL to connect to, defaults to online-go.com
     * @default https://online-go.com
     */
    server?: string;

    /** Bot username. This is automatically set. */
    username?: string;
    /** Bot ID. This is automatically set.
     * @hidden
     */
    bot_id?: number;
    /** Config for how to run your bot */
    bot?: BotConfig;
    opening_bot?: BotConfig;
    resign_bot?: BotConfig;

    /** Send a message saying what the bot thought the score was at the end of the game */
    farewellscore?: boolean;

    log_file?: string;

    /** Minimum rank to accept games from
     * @default 0
     * @minimum 0
     * @maximum 35
     */
    min_rank?: number;

    greeting?: string;
    farewell?: string;

    debug?: boolean;

    send_pv?: boolean;

    /* Old */
    aichat?: boolean;
    hidden?: boolean;
    timeout?: any;
    corrqueue?: any;

    json?: boolean;
    logfile?: string;
    min_move_time?: number;
    noclock?: boolean;
    nopause?: boolean;
    ogspv?: boolean;
    showboard?: boolean;
    start_date?: Date;
    startupbuffer?: number;

    greetingbotcommand?: string;
    persistnoncorr?: boolean;

    pv_format?: "LEELAZERO";
    nopauseranked?: boolean;
    nopauseunranked?: boolean;
    persist?: boolean;
}

/** Bot config */
export interface BotConfig {
    command: string[];
}

function defaults(): Config {
    return {
        apikey: "",
        server: "https://online-go.com",
        min_rank: 0,
        verbosity: 5,
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
        .strict()
        .parseSync();

    const args: { [k: string]: any } = yargs.argv;

    if (args.beta) {
        args.server = "https://beta.online-go.com";
    }

    const from_cli: Partial<Config> = {
        server: args.server,
        apikey: args.apikey,
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
