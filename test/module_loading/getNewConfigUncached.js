const { assignConfigArguments } = require("./assignConfigArguments.js");
const { requireUncached } = require("./requireUncached");

function getNewConfigUncached() {
    const config_module = requireUncached("../../dist/config");
    assignConfigArguments(config_module.config);
    return config_module.config;
}

exports.getNewConfigUncached = getNewConfigUncached;
