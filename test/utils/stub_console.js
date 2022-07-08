const sinon = require('sinon');

const { trace } = require('../../dist/trace');

function stub_console() {
    sinon.stub(trace, 'log');
    sinon.stub(trace, 'debug');
    sinon.stub(trace, 'error');
}

exports.stub_console = stub_console;
