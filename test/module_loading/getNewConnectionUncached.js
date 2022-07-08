const { requireUncached } = require('./requireUncached');

function getNewConnectionUncached() {
    const connection = requireUncached('../../dist/Connection');
    return connection;
}

exports.getNewConnectionUncached = getNewConnectionUncached;
