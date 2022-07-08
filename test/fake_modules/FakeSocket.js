const { trace } = require('../../dist/trace');

// Fake a socket.io-client
class FakeSocket {
    constructor() {
        this.on_callbacks = {};
        this.emit_callbacks = {};
    }

    on(ev, cb) {
        trace.log('client subscribe: ' + ev)
        this.on_callbacks[ev] = cb;
    }

    inject(ev, data) {
        trace.log('client on(' + ev + ')')
        this.on_callbacks[ev](data);
    }

    emit(ev, data, cb) {
        trace.log('client: ' + ev);

        let ret;
        if (this.emit_callbacks[ev]) {
            ret = this.emit_callbacks[ev](data);
        }
        if (cb) {
            cb(ret);
        }
    }

    on_emit(ev, cb) {
        trace.log('server subscribe: ' + ev);
        this.emit_callbacks[ev] = cb;
    }
}

exports.FakeSocket = FakeSocket;
