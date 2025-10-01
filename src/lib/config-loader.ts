import * as fs from "fs";
import * as JSON5 from "json5";
import * as ConfigSchema from "../../schema/Config.schema.json";
import { Validator } from "jsonschema";

/** Load and validate a gtp2ogs config file */
export async function loadConfig(configPath: string, validate = false): Promise<any> {
    const configContents = fs.readFileSync(configPath, { encoding: "utf8" });
    const config = JSON5.parse(configContents);

    if (validate) {
        validateConfig(config);
    }

    return config;
}

/** Load config file synchronously */
export function loadConfigSync(configPath: string, validate = false): any {
    const configContents = fs.readFileSync(configPath, { encoding: "utf8" });
    const config = JSON5.parse(configContents);

    if (validate) {
        validateConfig(config);
    }

    return config;
}

/** Validate a config object against the schema */
export function validateConfig(config: any): void {
    const validator = new Validator();
    const result = validator.validate(config, ConfigSchema);

    if (!result.valid) {
        const errors = result.errors.map((e) => `  ${e.property}: ${e.message}`).join("\n");
        throw new Error(`Config validation failed:\n${errors}`);
    }
}

/** Create ConnectionConfig from a loaded config file */
export function configToConnectionConfig(config: any): {
    apikey: string;
    username?: string;
    server?: string;
    bot_config: any;
} {
    return {
        apikey: config.apikey,
        username: config.username,
        server: config.server,
        bot_config: config,
    };
}
