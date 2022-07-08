const { trace } = require('../../dist/trace');

// Fake http/https request 
class FakeAPI {
    constructor() {
        this.callbacks = {};
        this.request = this.request.bind(this);
    }

    on_path(path, cb) {
        this.callbacks[path] = cb;
    }

    request(options, cb) {
        let response = '';
        trace.log('api ' + options.path);
        if (this.callbacks[options.path]) {
            response = this.callbacks[options.path](options);
        }
        cb({
            statusCode: 200,
            setEncoding: () => {},
            on: (ev, cb) => {
                if (ev === 'data') {
                    cb(response);
                }
                if (ev === 'end') {
                    cb();
                }
            },
        });
        return {
            on: () => {},
            write: () => {},
            end: () => {},
        };
    }
}

exports.FakeAPI = FakeAPI;
