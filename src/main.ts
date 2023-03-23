#!/usr/bin/env node
import { WebSocket } from "ws";
global.WebSocket = WebSocket;

import * as fs from "fs";
import * as JSON5 from "json5";
import * as ConfigSchema from "../schema/Config.schema.json";
import { trace } from "trace";
import { Validator } from "jsonschema";
import { Config, defaults, set_config, config } from "./config";
import { Connection } from "./Connection";
import { GobanSocket } from "goban/src/GobanSocket";
import * as yargs from "yargs";

load_config_or_exit("test.json5");

void yargs(process.argv.slice(2))
    .describe("url", "URL of the OGS server to connect to, defaults to https://online-go.com")
    .parse();

trace.info(yargs.argv);

//process.title = `gtp2ogs ${config.bot_command.join(" ")}`;

const socket = new GobanSocket(config.url);
new Connection(socket);

export function load_config_or_exit(filename: string) {
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

    set_config(with_defaults as Config);
}
