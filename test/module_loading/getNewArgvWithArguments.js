const { assignRootOptionsDefaults } = require('./assignRootOptionsDefaults');

function getNewArgvWithArguments() {
    const argv = {
        username: 'testbot',
        apikey: 'deadbeef',
        host: 'test',
        port: 80,
        debug: true,
        _: ['gtp-program', '--argument'],
    };

    assignRootOptionsDefaults(argv);

    return argv;
}

exports.getNewArgvWithArguments = getNewArgvWithArguments;
