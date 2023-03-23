/** Bot config */
export interface Config {
    /**
     * URL to connect to, defaults to online-go.com
     * @default https://online-go.com
     */

    url?: string;
    /** Bot username */
    username: string;
    /** API key for the bot. */
    apikey: string;
    /** Config for how to run your bot */
    bot?: BotConfig;
    opening_bot?: BotConfig;
    resign_bot?: BotConfig;

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

export function defaults(): Config {
    return {
        username: "",
        apikey: "",
        url: "https://online-go.com",
        min_rank: 0,
    };
}

export const config: Config = defaults();

export function set_config(new_config: Config) {
    Object.assign(config, new_config);
}
