// vim: tw=120 softtabstop=4 shiftwidth=4

const assert = require('assert');

const { requireUncached } = require('./module_loading/requireUncached');
const { stub_console } = require('./utils/stub_console');

let argv;

describe('process.argv to yargs.argv', () => {

    beforeEach(function() {
        // stub console before logging anything else
        stub_console();
    });
    
    it('get argv from process.argv in yargs.argv', () => {
        // TODO fix why do we need to input --username twice, else it complains about:
        /*
        Usage: --username --username <bot-username> --apikey <apikey> [gtp2ogs
               arguments] -- botcommand [bot arguments]
        (then full yargs showHelp here), and then:
        Missing required argument: username
        */
        const args = ["--username", "testbot", "--apikey", "deadbeef", "--host", "80", "--debug",
        "--", "gtp-program", "--argument"];

        //remove extra object {} at index 2
        if (process.argv[2]) process.argv.pop();

        for (const arg of args) {
            process.argv.push(arg);
        }

        console.log(JSON.stringify(process.argv));

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