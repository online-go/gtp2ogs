const { rootOptionsDefaults } = require('../../constants');

function assignConfigArguments(config) {
    config.DEBUG = true;
    config.apikey = 'deadbeef';
    config.host = 'test';
    config.port = 80;
    config.username = 'testbot';

    config.rejectnewmsg = rootOptionsDefaults.rejectnewmsg;

    config.bot_command = ['gtp-program', '--argument'];
}

exports.assignConfigArguments = assignConfigArguments;
