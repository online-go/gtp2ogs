function requireUncached(module) {
    // allows to reset module between 2 tests without inheriting previous assignments
    // ex: config.nopause in test 1 would be inherited with a new require (cached) of config
    //     in test 2

    delete require.cache[require.resolve(module)];
    return require(module);
}

exports.requireUncached = requireUncached;
