#!/usr/bin/env node

// Remove api key from command line ASAP.
process.title = "gtp2ogs";

// Do this before importing anything else in case the other modules use config.
import { getArgv } from "./getArgv";
import { config } from "./config";

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
