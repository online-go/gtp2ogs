const { requireUncached } = require('./requireUncached');

function getNewConfigUncached() {
    const config = requireUncached('../../config');
    return config;
}

exports.getNewConfigUncached = getNewConfigUncached;
