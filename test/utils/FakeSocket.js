const { console } = require('../../console');

// Fake a socket.io-client
class FakeSocket {
    constructor(configDEBUG) {
        this.on_callbacks = {};
        this.emit_callbacks = {};
        this.configDEBUG = configDEBUG;
    }

    on(ev, cb) {
        console.log('client subscribe: ' + ev)
        this.on_callbacks[ev] = cb;
    }

    inject(ev, data) {
        console.log('client on(' + ev + ')')
        this.on_callbacks[ev](data);
    }

    emit(ev, data, cb) {
        if (this.configDEBUG) {
            console.log('client: ' + ev);
        }
        let ret;
        if (this.emit_callbacks[ev]) {
            ret = this.emit_callbacks[ev](data);
        }
        if (cb) {
            cb(ret);
        }
    }

    on_emit(ev, cb) {
        console.log('server subscribe: ' + ev);
        this.emit_callbacks[ev] = cb;
    }
}

exports.FakeSocket = FakeSocket;