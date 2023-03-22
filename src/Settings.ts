import * as JSON5 from "json5";
import * as fs from "fs";
import { Validator } from "jsonschema";

/** Bot settings */
export interface Settings {
    /**
     * URL to connect to, defaults to online-go.com
     * @default https://online-go.com
     */

    url?: string;
    /** Bot username */
    username: string;
    /** API key for the bot. */
    apikey: string;
    /** Settings for how to run your bot */
    bot: BotSettings;
    opening_bot?: BotSettings;
    scoring_bot?: BotSettings;
}

/** Bot settings */
interface BotSettings {
    command: string;
}

function defaults(): Partial<Settings> {
    return {
        url: "https://online-go.com",
    };
}

export let settings: Settings;

export function load_settings_or_exit(filename: string): Settings {
    /* eslint-disable-next-line @typescript-eslint/no-var-requires */
    const SettingsSchema = require("./Settings.schema.json");
    const contents = fs.readFileSync(filename, "utf8");
    const raw = JSON5.parse(contents);
    const with_defaults = { ...defaults(), ...raw };
    const validator = new Validator();
    const result = validator.validate(with_defaults, SettingsSchema);

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

    settings = with_defaults as Settings;
    return with_defaults as Settings;
}
