#!/usr/bin/env node
// vim: tw=120 softtabstop=4 shiftwidth=4

'use strict';

// Remove api key from command line ASAP.
process.title = 'gtp2ogs';

// Do this before importing anything else in case the other modules use config.
const config = require('./config');
const io = require('socket.io-client');
config.updateFromArgv();

process.title = `gtp2ogs ${config.bot_command.join(' ')}`;

const console = require('./console').console;
const Connection = require('./connection').Connection;

process.on('uncaughtException', function (er) {
  console.trace("ERROR: Uncaught exception");
  console.error(`ERROR: ${er.stack}`);
  if (!conn || !conn.socket) {
    conn = new Connection(io, config);
  } else {
    //conn.connection_reset();
  }
})

let conn = new Connection(io, config);
