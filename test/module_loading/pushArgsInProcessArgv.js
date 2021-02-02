function pushArgsInProcessArgv(args) {
    for (const arg of args) {
        process.argv.push(arg);
    }
}

exports.pushArgsInProcessArgv = pushArgsInProcessArgv;
