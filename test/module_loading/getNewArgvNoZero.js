const { requireUncached } = require('./requireUncached');

function getNewArgvNoZero() {
    const argv = requireUncached('../../getArgv').getArgv();

    // do not compare $0 (main js executable file), mocha version always changes
    // ('$0': '../.vscode/extensions/hbenl.vscode-mocha-test-adapter-2.6.2/out/worker/bundle.js')
    // and it is always gtp2ogs.js in real gtp2ogs run.
    // ('$0': 'gtp2ogs.js')
    delete argv["$0"];

    return argv;
}

exports.getNewArgvNoZero = getNewArgvNoZero;
