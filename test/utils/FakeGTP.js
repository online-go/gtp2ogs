const { console } = require('../../console');
const stream = new require('stream');

// Fake GTP child_process (spwan)
class FakeGTP {
    constructor(configDEBUG) {
        this.configDEBUG = configDEBUG;

        this.pid = 100;
        this.callbacks = {};
        this.cmd_callbacks = {};
        this.stderr = new stream.Readable({ read: () => {}});
        this.callbacks.stderr = (data) => this.stderr.emit('data', data);

        this.stdout = { on: (_, cb) => {
            this.callbacks.stdout = cb;
        }};
        this.stdin = {
            on: (_, cb) => {
                this.callbacks.stdin = cb;
            },
            end: () => {},
            write: (data) => {
                if (this.configDEBUG) {
                    console.log('STDIN: ', data.trim());
                }
                let cmd = data.trim().split(' ')[0];
                if (this.cmd_callbacks[cmd]) {
                    this.cmd_callbacks[cmd](data.trim());
                } else {
                    this.gtp_response('');
                }
            }
        };
    }

    on(ev, cb) {
        this.callbacks[ev] = cb;
    }

    on_cmd(cmd, cb) {
        console.log('GTP: ', cmd);
        this.cmd_callbacks[cmd] = cb;
    }

    gtp_response(data) {
        this.callbacks.stdout('= ' + data + "\n\n");
    }

    gtp_error(data) {
        this.callbacks.stdout('? ' + data + "\n\n");
    }

    exit(code) {
        if (this.callbacks.exit) {
            this.callbacks.exit({ code: code, signal: null });
        }
    }

    kill() {
        this.exit(1);
    }
}

exports.FakeGTP = FakeGTP;
