#!/usr/bin/env node
// vim: tw=120 softtabstop=4 shiftwidth=4

'use strict';

// Remove api key from command line ASAP.
process.title = 'gtp2ogs';

const start_date = new Date();


const { getArgv, fixInvalidLogfileName } = require('./getArgv');
const argv = getArgv();
// cannot start logfile console as long as logfile is not fixed to a valid filename, fix it ASAP in argv.
fixInvalidLogfileName(argv, start_date);

const { setLogfileConsole } = require('./console');
const fs = require('fs');
// once we have debug and valid logfile informations (from argv) we can start writing console output
// to a logfile using our custom styled console.js, before we have these informations we can also
// use our custom styled console.js but it will not log anything in the logfile.
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
