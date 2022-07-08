const { assignConfigArguments } = require('./assignConfigArguments.js');

function getNewConfig() {
    const config_module = require('../../dist/config');
    assignConfigArguments(config_module.config);
    return config_module.config;
}

exports.getNewConfig = getNewConfig;
