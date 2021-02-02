const { assignRootOptionsDefaults } = require('./assignRootOptionsDefaults');
const { assignRankedUnrankedDefaults } = require('./assignRankedUnrankedDefaults');

function assignConfigArguments(config) {
    config.username = 'testbot';
    config.apikey = 'deadbeef';
    config.host = 'test';
    config.port = 80;
    config.DEBUG = true;
    config.bot_command = ['gtp-program', '--argument'];

    assignRootOptionsDefaults(config);
    assignRankedUnrankedDefaults(config);
}

exports.assignConfigArguments = assignConfigArguments;
