import * as fs from "fs";
import * as JSON5 from "json5";
import * as yargs from "yargs";
import * as ConfigSchema from "../schema/Config.schema.json";
import { Validator } from "jsonschema";

/** Bot config */
export interface Config {
    /**
     * URL to connect to, defaults to online-go.com
     * @default https://online-go.com
     */

    url?: string;
    /** Bot username */
    username: string;
    /** Bot ID. This is automatically set.
     * @hidden
     */
    bot_id?: number;
    /** API key for the bot. */
    apikey: string;
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
    DEBUG?: boolean;
    hidden?: boolean;
    host?: string;
    insecure?: any;
    port?: any;
    timeout?: any;
    corrqueue?: any;

    json?: boolean;
    logfile?: string;
    min_move_time?: number;
    noclock?: boolean;
    nopause?: boolean;
    ogspv?: boolean;
    resign_bot_command?: boolean;
    showboard?: boolean;
    start_date?: Date;
    startupbuffer?: number;
}

/** Bot config */
export interface BotConfig {
    command: string;
}

function defaults(): Config {
    return {
        username: "",
        apikey: "",
        url: "https://online-go.com",
        min_rank: 0,
    };
}

export const config: Config = load_config_or_exit();

function load_config_or_exit(): Config {
    yargs(process.argv.slice(2))
        .describe("url", "URL of the OGS server to connect to, defaults to https://online-go.com")
        .parseSync();

    const filename = "test.json5";

    /* eslint-disable-next-line @typescript-eslint/no-var-requires */
    const contents = fs.readFileSync(filename, "utf8");
    const raw = JSON5.parse(contents);
    const with_defaults = { ...defaults(), ...raw };
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

    return with_defaults;
}
