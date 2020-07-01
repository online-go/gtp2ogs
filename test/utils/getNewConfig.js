const { assignConfigArguments } = require('./assignConfigArguments.js');

function getNewConfig() {
    const config = require('../../config');
    assignConfigArguments(config);
    return config;
}

exports.getNewConfig = getNewConfig;