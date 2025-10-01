import * as yargs from "yargs";
import { loadConfigSync } from "./config-loader";

export interface ParsedArgs {
    config?: any;
    server?: string;
    apikey?: string;
    username?: string;
    verbosity?: number;
    beta?: boolean;
    [key: string]: any;
}

/**
 * Parse command line arguments for library usage
 * Supports common flags like --server, --apikey, --config, --beta, etc.
 */
export function parseArgs(argv?: string[]): ParsedArgs {
    const args = yargs(argv || process.argv.slice(2))
        .option("config", {
            alias: "c",
            describe: "Path to configuration file (.json5)",
            type: "string",
        })
        .option("server", {
            describe: "OGS server URL",
            type: "string",
        })
        .option("beta", {
            describe: "Connect to beta server (overrides --server)",
            type: "boolean",
        })
        .option("apikey", {
            describe: "Bot API key",
            type: "string",
        })
        .option("username", {
            describe: "Bot username",
            type: "string",
        })
        .option("verbosity", {
            alias: "v",
            describe: "Verbosity level (use multiple -v for more)",
            count: true,
        })
        .help()
        .parseSync();

    const result: ParsedArgs = {};

    // Handle beta flag
    if (args.beta) {
        result.server = "https://beta.online-go.com";
    }

    // Extract CLI overrides
    if (args.server) result.server = args.server as string;
    if (args.apikey) result.apikey = args.apikey as string;
    if (args.username) result.username = args.username as string;
    if (args.verbosity) result.verbosity = args.verbosity as number;

    // Load config file if specified
    if (args.config) {
        try {
            result.config = loadConfigSync(args.config);
        } catch (error) {
            throw new Error(`Failed to load config file: ${error.message}`);
        }
    }

    return result;
}

/**
 * Merge command line arguments with config, CLI args take precedence
 */
export function mergeConfigWithArgs(config: any, args: ParsedArgs): any {
    const merged = { ...config };

    // CLI args override config file
    if (args.server !== undefined) merged.server = args.server;
    if (args.apikey !== undefined) merged.apikey = args.apikey;
    if (args.username !== undefined) merged.username = args.username;
    if (args.verbosity !== undefined) merged.verbosity = args.verbosity;

    return merged;
}

/**
 * Load config from file and merge with command line args
 * This is the main helper function most users should use
 *
 * @example
 * ```typescript
 * // Supports: node bot.js --config mybot.json5 --server http://localhost:8080
 * const config = loadConfigWithArgs();
 * const connection = new Connection(configToConnectionConfig(config));
 * ```
 */
export function loadConfigWithArgs(argv?: string[], validate = false): any {
    const args = parseArgs(argv);

    if (!args.config && !args.apikey) {
        throw new Error(
            "Either --config <file> or --apikey <key> is required. Use --help for usage.",
        );
    }

    let config = args.config || {};

    // Merge CLI args (they take precedence)
    config = mergeConfigWithArgs(config, args);

    // Validate the final merged config if requested
    if (validate) {
        const { validateConfig } = require("./config-loader");
        validateConfig(config);
    }

    return config;
}
