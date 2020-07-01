const { requireUncached } = require('./requireUncached');

function getNewConnectionUncached() {
    const connection = requireUncached('../../connection');
    return connection;
}

exports.getNewConnectionUncached = getNewConnectionUncached;