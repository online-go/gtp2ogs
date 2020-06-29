function assignNewConfig(config) {
    config.DEBUG = true;
    config.apikey = 'deadbeef';
    config.host = 'test';
    config.port = 80;
    config.username = 'testbot';

    config.bot_command = ['gtp-program', '--argument'];
}

exports.assignNewConfig = assignNewConfig;