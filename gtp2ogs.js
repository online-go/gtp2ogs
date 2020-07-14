#!/usr/bin/env node
// vim: tw=120 softtabstop=4 shiftwidth=4

'use strict';

// Remove api key from command line ASAP.
process.title = 'gtp2ogs';

// Do this before importing anything else in case the other modules use config.
const { getArgv } = require('./getArgv');
const argv = getArgv();
const config = require('./config');
config.updateFromArgv(argv);

process.title = `gtp2ogs ${config.bot_command.join(' ')}`;

const console = require('./console').console;

const io = require('socket.io-client');
const Connection = require('./connection').Connection;

process.on('uncaughtException', function (er) {
  console.trace("ERROR: Uncaught exception");
  console.error(`ERROR: ${er.stack}`);
  if (!conn || !conn.socket) {
    conn = getNewConnection();
  } else {
    //conn.connection_reset();
  }
})

let conn = getNewConnection();

function getNewConnection() {
  return new Connection(io, config);
}
