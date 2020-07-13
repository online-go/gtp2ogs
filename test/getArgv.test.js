// vim: tw=120 softtabstop=4 shiftwidth=4

const assert = require('assert');

const { requireUncached } = require('./module_loading/requireUncached');
const { stub_console } = require('./utils/stub_console');

let argv;

describe('process.argv to yargs.argv', () => {

    beforeEach(function() {
        // stub console before logging anything else
        stub_console();

        //remove extra object {} at index 2 (and more if there are any)
        process.argv = process.argv.slice(0,2);
    });
    
    it('get argv from process.argv in yargs.argv', () => {
        const args = ["--username", "testbot", "--apikey", "deadbeef", "--host", "80", "--debug",
        "--", "gtp-program", "--argument"];
        for (const arg of args) {
            process.argv.push(arg);
        }

        argv = requireUncached('../../getArgv').getArgv();

        const expectedYargsArgv = {
            username: "testbot",
            apikey: "deadbeef",
            host: 80,
            debug: true,
            // defaults inputted in getArgv.js
            maxconnectedgames: 20,
            maxconnectedgamesperuser: 3,
            port: 443,
            rejectnewmsg: "Currently, this bot is not accepting games, try again later",
            startupbuffer: 5,
            timeout: 0,
            // bot command
            _: ["gtp-program", "--argument"]
        };

        // do not compare $0 (main js executable file), mocha version always changes
        // ('$0': '../.vscode/extensions/hbenl.vscode-mocha-test-adapter-2.6.2/out/worker/bundle.js')
        // and it is always gtp2ogs.js in real gtp2ogs run.
        // ('$0': 'gtp2ogs.js')
        const noZeroArgv = { ...argv };
        delete noZeroArgv["$0"];

        assert.deepEqual(noZeroArgv, expectedYargsArgv);
    });

});