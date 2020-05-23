const assert = require('assert');
const { rejectNewByTime } = require('../config/rejectNewByTime');

describe('Config', () => {
    it('should reject during rejectnewtime 4:00-5:00', () => {
        assert.ok(!rejectNewByTime('4:00-5:00', new Date(2020, 5, 20, 1)));
        assert.ok(!rejectNewByTime('4:00-5:00', new Date(2020, 5, 20, 2)));
        assert.ok(!rejectNewByTime('4:00-5:00', new Date(2020, 5, 20, 3)));
        assert.ok(rejectNewByTime('4:00-5:00', new Date(2020, 5, 20, 4)));
        assert.ok(rejectNewByTime('4:00-5:00', new Date(2020, 5, 20, 4, 30)));
        assert.ok(!rejectNewByTime('4:00-5:00', new Date(2020, 5, 20, 5)));
        assert.ok(!rejectNewByTime('4:00-5:00', new Date(2020, 5, 20, 5, 1)));
        assert.ok(!rejectNewByTime('4:00-5:00', new Date(2020, 5, 20, 22)));
    });

    it('should not reject outside rejectnewtime 23:00-4:00', () => {
        assert.ok(!rejectNewByTime('23:00-4:00', new Date(2020, 5, 20, 22)));
        assert.ok(!rejectNewByTime('23:00-4:00', new Date(2020, 5, 20, 23)));
        assert.ok(rejectNewByTime('23:00-4:00', new Date(2020, 5, 20, 23, 30)));
        assert.ok(rejectNewByTime('23:00-4:00', new Date(2020, 5, 21, 0)));
        assert.ok(rejectNewByTime('23:00-4:00', new Date(2020, 5, 21, 3)));
        assert.ok(!rejectNewByTime('23:00-4:00', new Date(2020, 5, 21, 4)));
        assert.ok(!rejectNewByTime('23:00-4:00', new Date(2020, 5, 21, 5)));
    });
});
