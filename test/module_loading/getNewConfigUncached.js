const { assignConfigArguments } = require('./assignConfigArguments.js');
const { requireUncached } = require('./requireUncached');

function getNewConfigUncached() {
    const config = requireUncached('../../config');
    assignConfigArguments(config);
    return config;
}

exports.getNewConfigUncached = getNewConfigUncached;
