#!/usr/bin/env node

import * as JSON5 from "json5";
import * as fs from "fs";
import { Validator } from "jsonschema";
import { Config, defaults, set_config } from "./config";
import * as ConfigSchema from "../schema/Config.schema.json";

load_config_or_exit("test.json5");

//process.title = `gtp2ogs ${config.bot_command.join(" ")}`;

import { trace } from "./trace";
import { io } from "socket.io-client";
import { Connection } from "./Connection";

process.on("uncaughtException", (err) => {
    console.trace("ERROR: Uncaught exception");
    trace.error(err);
    if (!conn || !conn.socket) {
        conn = getNewConnection();
    } else {
        //conn.connection_reset();
    }
});

let conn = getNewConnection();

function getNewConnection() {
    return new Connection(io);
}

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
