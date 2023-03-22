#!/usr/bin/env node

// Remove api key from command line ASAP.
process.title = "gtp2ogs";

// Do this before importing anything else in case the other modules use config.
import { getArgv } from "./getArgv";
import { config } from "./config";
import { load_settings_or_exit /*, settings */ } from "./Settings";

load_settings_or_exit("test.json5");

const argv = getArgv();
config.updateFromArgv(argv);

process.title = `gtp2ogs ${config.bot_command.join(" ")}`;

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
    return new Connection(io, config);
}
