const { rootOptionsDefaults } = require('../../constants');

function assignRootOptionsDefaults(args) {
    for (const k in rootOptionsDefaults) {
        args[k] = rootOptionsDefaults[k];
    }
}

exports.assignRootOptionsDefaults = assignRootOptionsDefaults;
