const sinon = require('sinon');

const { console } = require('../../console');

function stub_console() {
    sinon.stub(console, 'log');
    sinon.stub(console, 'debug');
    sinon.stub(console, 'error');
}

exports.stub_console = stub_console;
