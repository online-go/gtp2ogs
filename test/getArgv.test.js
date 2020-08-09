const assert = require('assert');

const { fixInvalidLogfileName } = require('../getArgv');
const { getNewArgvWithArguments } = require('./module_loading/getNewArgvWithArguments');

let argv;

// - month is between 0 and 11 (add +1)
// - Date.UTC in this local test to avoid local GMT mismatch between expected and result,
//   that varies between testing machines, but local time is fine in the real gtp2ogs.
//   ex: GMT+2 on this local machine would make 0 (hours) AM GMT +2 become 22 (hours) PM
//   of the previous day.
//   https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/UTC
const start_date = new Date(Date.UTC(2020, 6, 10, 8, 30, 45, 333));

describe('Fix argv.logfile to valid filename', () => {

    beforeEach(function () {
        argv = getNewArgvWithArguments();
    });

    it('export logfile filename string without change if valid', () => {
        argv.logfile = "some-filename";

        fixInvalidLogfileName(argv, start_date);
        
        assert.deepEqual(argv.logfile, "some-filename");
    });

    it('export fixed logfile filename if invalid string filename', () => {
        argv.logfile = "*/\\_some-file#<>$!&*'{?\"}:name 9876543210AZaz@+|=,;._!?==`file-";

        fixInvalidLogfileName(argv, start_date);

        assert.deepEqual(argv.logfile, "---_some-file-------------name 9876543210AZaz------._-----file-");
    });

    it('export logfile with default filename based on current date and time if empty string (--logfile)', () => {
        argv.logfile = "";


        fixInvalidLogfileName(argv, start_date);

        assert.deepEqual(argv.logfile, "gtp2ogs-logfile-2020-07-10T08-30-45.333Z");
    });

    it('export logfile filename as a string without change if all characters are valid and are numbers', () => {
        argv.logfile = "333333333";

        fixInvalidLogfileName(argv, start_date);

        assert.deepEqual(argv.logfile, "333333333");
    });

    it('do not export logfile if not used', () => {
        fixInvalidLogfileName(argv, start_date);
        
        assert.deepEqual(argv.logfile, undefined);
    });

});
