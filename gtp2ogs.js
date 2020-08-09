#!/usr/bin/env node
// vim: tw=120 softtabstop=4 shiftwidth=4

'use strict';

// Remove api key from command line ASAP.
process.title = 'gtp2ogs';

const start_date = new Date();


const { getArgv, fixInvalidLogfileName } = require('./getArgv');
const argv = getArgv();
// start writing console output in the logfile using our custom styled console.js only once we have debug
// and valid logfile informations from argv, use native node console until then, which will not log anything
// in the logfile.
fixInvalidLogfileName(argv, start_date);

const { setLogfileConsole } = require('./console');
const fs = require('fs');
const console = setLogfileConsole(argv, fs);

// Do this before importing anything other than argv or console, in case these other modules use config.
const config = require('./config');
config.updateFromArgv(argv);

process.title = `gtp2ogs ${config.bot_command.join(' ')}`;

const io = require('socket.io-client');
const { Connection } = require('./connection');

process.on('uncaughtException', function (er) {
    console.trace("ERROR: Uncaught exception");
    console.error(`ERROR: ${er.stack}`);
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
