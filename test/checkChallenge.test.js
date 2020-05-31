// vim: tw=120 softtabstop=4 shiftwidth=4

let assert = require('assert');

let config;
let connection;
let console = require('../console').console;

let sinon = require('sinon');

let https = require('https');

let { FakeSocket, FakeAPI, base_challenge } = require('./test')

function stub_console() {
    sinon.stub(console, 'log');
    sinon.stub(console, 'debug');
}

function requireUncached(module) {
  delete require.cache[require.resolve(module)];
  return require(module);
}

function getNewConfig() {
  const config = requireUncached('../config');

  config.DEBUG = true;
  config.apikey = 'deadbeef';
  config.host = 'test';
  config.port = 80;
  config.username = 'testbot';
 
  config.allowed_boardsizes[19] = true;
  config.allow_all_komis = true;
  config.allowed_speeds['live'] = true;
  config.allowed_timecontrols['fischer'] = true;

  config.bot_command = ['gtp-program', '--argument'];
  return config; 
}

afterEach(function () {
    sinon.restore();
});

describe('Challenges', () => {
  
  let conn;
 
  beforeEach(function() {
    config = getNewConfig();
    connection = requireUncached('../connection');

    stub_console();
    sinon.useFakeTimers();
    
    let fake_api = new FakeAPI();
    fake_api.request({path: '/foo'}, () => {});
    sinon.stub(https, 'request').callsFake(fake_api.request);
    
    let fake_socket = new FakeSocket();
    conn = new connection.Connection(() => { return fake_socket; }, config);
  });
  
  describe('General rules', () => {
    it('Empty config (except defaults in test.js) should accept challenge', () => {
      const notification = base_challenge();
      
      const result = conn.checkChallenge(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

  });

  describe('Bans', () => {
    it('should reject banned users', () => {
      const notification = base_challenge({ user: { username: 'bannedName', id: 5 } });

      config.banned_users[notification.user.username] = true;
      
      const result = conn.checkChallengeMandatory(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'You (bannedName) are not allowed to play games against this bot.' }));
    });
    
    it('should reject banned users by id', () => {
      const notification = base_challenge({ user: { username: 'bannedName', id: 5 } });

      config.banned_users[notification.user.id] = true;
      
      const result = conn.checkChallengeMandatory(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'You (bannedName) are not allowed to play games against this bot.' }));
    });
      
    it('should reject banned ranked users', () => {
      const notification = base_challenge({ ranked: true, user: { username: 'bannedRankedName', id: 6 } });

      config.banned_users_ranked[notification.user.username] = true;
      
      const result = conn.checkChallengeMandatory(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'You (bannedRankedName) are not allowed to play ranked games against this bot.' }));
    });
      
    it('should reject banned ranked users by id', () => {
      const notification = base_challenge({ ranked: true, user: { username: 'bannedRankedName', id: 6 } });

      config.banned_users_ranked[notification.user.id] = true;
      
      const result = conn.checkChallengeMandatory(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'You (bannedRankedName) are not allowed to play ranked games against this bot.' }));
    });
    
    it('should reject banned unranked users', () => {
      const notification = base_challenge({ ranked: false, user: { username: 'bannedUnrankedName', id: 7 } });

      config.banned_users_unranked[notification.user.username] = true;
      
      const result = conn.checkChallengeMandatory(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'You (bannedUnrankedName) are not allowed to play unranked games against this bot.' }));
    });
    
    it('should reject banned unranked users by id', () => {
      const notification = base_challenge({ ranked: false, user: { username: 'bannedUnrankedName', id: 7 } });

      config.banned_users_unranked[notification.user.id] = true;
      
      const result = conn.checkChallengeMandatory(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'You (bannedUnrankedName) are not allowed to play unranked games against this bot.' }));
    });

  });

  describe('Min Max Rank', () => {

    it('reject user ranking too low', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 10 } }); // "20k"

      config.minrank = 17;
      config.maxrank = 32;
      
      const result = conn.checkChallengeMandatory(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'This bot only accepts games from 13k players or stronger ranking.' }));

    });

    it('accept user ranking edge min', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 17 } }); // "13k"

      config.minrank = 17;
      config.maxrank = 32;
      
      const result = conn.checkChallengeMandatory(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('accept user ranking between min and max', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 25 } }); // "5k"

      config.minrank = 17;
      config.maxrank = 32;
      
      const result = conn.checkChallengeMandatory(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('accept user ranking edge max', () => {
      const notification = base_challenge({ ranked: false, user: { ranking: 32 } }); // "3d"

      config.minrank = 17;
      config.maxrank = 32;
      
      const result = conn.checkChallengeMandatory(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('reject user ranking too high', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 35 } }); // "6d"

      config.minrank = 17;
      config.maxrank = 32;
      
      const result = conn.checkChallengeMandatory(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'This bot only accepts games from 3d players or weaker ranking.' }));

    });

    it('reject user ranking too high (9d+)', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 41 } }); // "12d"

      config.minrank = 17;
      config.maxrank = 32;
      
      const result = conn.checkChallengeMandatory(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'This bot only accepts games from 3d players or weaker ranking.' }));

    });

    it('reject user ranking too high (pro)', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 37 } }); // "1p" (1p" = "8d")

      config.minrank = 17;
      config.maxrank = 32;
      
      const result = conn.checkChallengeMandatory(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'This bot only accepts games from 3d players or weaker ranking.' }));
   });
   
  });

  describe('Min Max Handicap', () => {

    it('reject handicap too low (automatic handicap is -1)', () => {

      const notification = base_challenge({ ranked: false, handicap: -1 });

      config.minhandicap = 0;
      config.maxhandicap = 2;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum number of handicap stones is 0, please increase the number of handicap stones.' }));

    });

    it('reject handicap too low (fakerank automatic handicap stone number estimation)', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 30 }, handicap: -1 }); // "1d"

      config.fakerank    = 29; // "1k"
      // "1d" - "1k" = 30 - 29 = 1 automatic handicap stones
      config.minhandicap = 2;
      config.maxhandicap = 6;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum number of handicap stones is 2, please increase the number of handicap stones, please manually select the number of handicap stones in -custom handicap-.' }));

    });

    it('reject handicap too low (handicap games only)', () => {

      const notification = base_challenge({ ranked: false, handicap: 0 });

      config.minhandicap = 2;
      config.maxhandicap = 6;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum number of handicap stones is 2, please increase the number of handicap stones (handicap games only).' }));

    });

    it('accept handicap edge min', () => {

      const notification = base_challenge({ ranked: false, handicap: 0 });

      config.minhandicap = 0;
      config.maxhandicap = 6;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('accept handicap edge min (fakerank automatic handicap stone number estimation)', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 29 }, handicap: -1 }); // "1k"

      config.fakerank    = 29; // "1k"
      // "1k" - "1k" = 29 - 29 = 0 automatic handicap stones
      config.minhandicap =  0;
      config.maxhandicap =  6;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('accept handicap between min and max', () => {

      const notification = base_challenge({ ranked: false, handicap: 1 });

      config.minhandicap = 0;
      config.maxhandicap = 6;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('accept handicap between min and max (fakerank automatic handicap stone number estimation)', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 30 }, handicap: -1 }); // "1d"

      config.fakerank    = 26; // "4k"
      // "1d" - "4k" = 30 - 26 = 4 automatic handicap stones
      config.minhandicap =  0;
      config.maxhandicap =  6;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('accept handicap edge max', () => {

      const notification = base_challenge({ ranked: false, handicap: 6 });

      config.minhandicap = 0;
      config.maxhandicap = 6;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('accept handicap edge max (fakerank automatic handicap stone number estimation)', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 30 }, handicap: -1 }); // "1d"

      config.fakerank    = 24; // "6k"
      // "1d" - "6k" = 30 - 24 = 6 automatic handicap stones
      config.minhandicap =  0;
      config.maxhandicap =  6;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('reject handicap too high (even games only) ', () => {

      const notification = base_challenge({ ranked: false, handicap: 1 });

      config.minhandicap = 0;
      config.maxhandicap = 0;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum number of handicap stones is 0, please reduce the number of handicap stones (no handicap games).' }));

    });

    it('reject handicap too high ', () => {

      const notification = base_challenge({ ranked: false, handicap: 9 });

      config.minhandicap = 0;
      config.maxhandicap = 6;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum number of handicap stones is 6, please reduce the number of handicap stones.' }));

    });

    it('reject handicap too high (fakerank automatic handicap stone number estimation)', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 17 }, handicap: -1 }); // "13k"

      config.fakerank    = 32; // "3d"
      // "3d" - "13k" = 32 - 17 = 15 automatic handicap stones
      config.minhandicap = 0;
      config.maxhandicap = 6;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum number of handicap stones is 6, please reduce the number of handicap stones, please manually select the number of handicap stones in -custom handicap-.' }));

    });

  });

  describe('Byoyomi time settings', () => {

    // sample:
    // {"system":"byoyomi","time_control":"byoyomi","speed":"live","pause_on_weekends":false,"main_time":1200,"period_time":30,"periods":5}

    // Main Time Blitz

    it('reject main time blitz too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 1, period_time: 1 } });

      config.minmaintimeblitz = 10;
      config.maxmaintimeblitz = 30;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum Main Time for blitz games in byoyomi is 10 seconds, please increase Main Time.' }));
    });

    it('accept main time blitz edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 10, periods: 1, period_time: 1 } });

      config.minmaintimeblitz = 10;
      config.maxmaintimeblitz = 30;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept main time blitz between min and max ', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 20, periods: 1, period_time: 1 } });

      config.minmaintimeblitz = 10;
      config.maxmaintimeblitz = 30;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept main time blitz edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 30, periods: 1, period_time: 1 } });

      config.minmaintimeblitz = 10;
      config.maxmaintimeblitz = 30;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept main time blitz too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 31, periods: 1, period_time: 1 } });

      config.minmaintimeblitz = 10;
      config.maxmaintimeblitz = 30;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum Main Time for blitz games in byoyomi is 30 seconds, please reduce Main Time.' }));
    });

    // Periods Blitz

    it('reject number of periods blitz too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 1, period_time: 1 } });

      config.minperiodsblitz = 3;
      config.maxperiodsblitz = 20;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum number of periods for blitz games in byoyomi is 3, please increase the number of periods.' }));
    });

    it('accept number of periods blitz edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 3, period_time: 1 } });

      config.minperiodsblitz = 3;
      config.maxperiodsblitz = 20;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept number of periods blitz between min and max ', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 12, period_time: 1 } });

      config.minperiodsblitz = 3;
      config.maxperiodsblitz = 20;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept number of periods blitz edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 20, period_time: 1 } });

      config.minperiodsblitz = 3;
      config.maxperiodsblitz = 20;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept number of periods blitz too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 100, period_time: 1 } });

      config.minperiodsblitz = 3;
      config.maxperiodsblitz = 20;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum number of periods for blitz games in byoyomi is 20, please reduce the number of periods.' }));
    });

    // Period Time Blitz

    it('reject period time blitz too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 1, period_time: 1 } });

      config.minperiodtimeblitz = 5;
      config.maxperiodtimeblitz = 15;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: `Minimum Period Time for blitz games in byoyomi is 5 seconds, please increase Period Time.` }));
    });

    it('accept period time blitz edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 1, period_time: 5 } });

      config.minperiodtimeblitz = 5;
      config.maxperiodtimeblitz = 15;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept period time blitz between min and max ', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 1, period_time: 11 } });

      config.minperiodtimeblitz = 5;
      config.maxperiodtimeblitz = 15;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept period time blitz edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 1, period_time: 15 } });

      config.minperiodtimeblitz = 5;
      config.maxperiodtimeblitz = 15;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept period time blitz too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 1, period_time: 22 } });

      config.minperiodtimeblitz = 5;
      config.maxperiodtimeblitz = 15;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum Period Time for blitz games in byoyomi is 15 seconds, please reduce Period Time.' }));
    });

    // Main Time Live

    it('reject main time live too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 1, period_time: 1 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 300;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum Main Time for live games in byoyomi is 1 minutes, please increase Main Time.' }));
    });
  
    it('accept main time live edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 60, periods: 1, period_time: 1 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 300;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });
  
    it('accept main time live between min and max ', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 180, periods: 1, period_time: 1 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 300;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });
  
    it('accept main time live edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 300, periods: 1, period_time: 1 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 300;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });
  
    it('accept main time live too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 301, periods: 1, period_time: 1 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 300;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum Main Time for live games in byoyomi is 5 minutes, please reduce Main Time.' }));
    });
  
    // Periods Live
  
    it('reject number of periods live too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 1, period_time: 1 } });
  
      config.minperiodslive = 3;
      config.maxperiodslive = 20;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum number of periods for live games in byoyomi is 3, please increase the number of periods.' }));
    });
  
    it('accept number of periods live edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 3, period_time: 1 } });
  
      config.minperiodslive = 3;
      config.maxperiodslive = 20;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });
  
    it('accept number of periods live between min and max ', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 12, period_time: 1 } });
  
      config.minperiodslive = 3;
      config.maxperiodslive = 20;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });
  
    it('accept number of periods live edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 20, period_time: 1 } });
  
      config.minperiodslive = 3;
      config.maxperiodslive = 20;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });
  
    it('accept number of periods live too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 100, period_time: 1 } });
  
      config.minperiodslive = 3;
      config.maxperiodslive = 20;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum number of periods for live games in byoyomi is 20, please reduce the number of periods.' }));
    });
  
    // Period Time Live
  
    it('reject period time live too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 1, period_time: 1 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 120;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: `Minimum Period Time for live games in byoyomi is 10 seconds, please increase Period Time.` }));
    });
  
    it('accept period time live edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 1, period_time: 10 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 120;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });
  
    it('accept period time live between min and max ', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 1, period_time: 30 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 120;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });
  
    it('accept period time live edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 1, period_time: 120 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 120;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });
  
    it('accept period time live too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 1, period_time: 121 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 120;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum Period Time for live games in byoyomi is 2 minutes, please reduce Period Time.' }));
    });

    // Main Time Correspondence

    it('reject main time correspondence too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 1, period_time: 1 } });

      config.minmaintimecorr = 259200;
      config.maxmaintimecorr = 604800;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum Main Time for correspondence games in byoyomi is 3 days, please increase Main Time.' }));
    });

    it('accept main time correspondence edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 259200, periods: 1, period_time: 1 } });

      config.minmaintimecorr = 259200;
      config.maxmaintimecorr = 604800;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept main time correspondence between min and max ', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 454600, periods: 1, period_time: 1 } });

      config.minmaintimecorr = 259200;
      config.maxmaintimecorr = 604800;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept main time correspondence edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 604800, periods: 1, period_time: 1 } });

      config.minmaintimecorr = 259200;
      config.maxmaintimecorr = 604800;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept main time correspondence too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 604801, periods: 1, period_time: 1 } });

      config.minmaintimecorr = 259200;
      config.maxmaintimecorr = 604800;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum Main Time for correspondence games in byoyomi is 7 days, please reduce Main Time.' }));
    });

    // Periods Correspondence

    it('reject number of periods correspondence too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 1, period_time: 1 } });

      config.minperiodscorr = 3;
      config.maxperiodscorr = 10;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum number of periods for correspondence games in byoyomi is 3, please increase the number of periods.' }));
    });

    it('accept number of periods correspondence edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 3, period_time: 1 } });

      config.minperiodscorr = 3;
      config.maxperiodscorr = 10;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept number of periods correspondence between min and max ', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 5, period_time: 1 } });

      config.minperiodscorr = 3;
      config.maxperiodscorr = 10;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept number of periods correspondence edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 10, period_time: 1 } });

      config.minperiodscorr = 3;
      config.maxperiodscorr = 10;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept number of periods correspondence too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 25, period_time: 1 } });

      config.minperiodscorr = 3;
      config.maxperiodscorr = 10;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum number of periods for correspondence games in byoyomi is 10, please reduce the number of periods.' }));
    });

    // Period Time Correspondence

    it('reject period time correspondence too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 1, period_time: 1 } });

      config.minperiodtimecorr = 14400;
      config.maxperiodtimecorr = 259200;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: `Minimum Period Time for correspondence games in byoyomi is 4 hours, please increase Period Time.` }));
    });

    it('accept period time correspondence edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 1, period_time: 14400 } });

      config.minperiodtimecorr = 14400;
      config.maxperiodtimecorr = 259200;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept period time correspondence between min and max ', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 1, period_time: 60000 } });

      config.minperiodtimecorr = 14400;
      config.maxperiodtimecorr = 259200;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept period time correspondence edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 1, period_time: 259200 } });

      config.minperiodtimecorr = 14400;
      config.maxperiodtimecorr = 259200;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept period time correspondence too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 1, period_time: 512000 } });

      config.minperiodtimecorr = 14400;
      config.maxperiodtimecorr = 259200;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum Period Time for correspondence games in byoyomi is 3 days, please reduce Period Time.' }));
    });

  });

  describe('No main time challenge check for some time controls', () => {


    
  });

  describe('No number of periods check for non-byoyomi timecontrols', () => {

    it('canadian timecontrol accepts any periods number even if too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 1, main_time: 1, period_time: 1 } });

      config.minperiodslive = 3;
      config.maxperiodslive = 20;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('canadian timecontrol accepts any periods number even if between min and mix', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 10, main_time: 10, period_time: 10 } });

      config.minperiodslive = 3;
      config.maxperiodslive = 20;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('canadian timecontrol accepts any periods number even if too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 99, main_time: 99, period_time: 99 } });

      config.minperiodslive = 3;
      config.maxperiodslive = 20;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

  });

  describe('No period time challenge check for some time controls', () => {


    
  });

  describe('Canadian time settings', () => {

    // sample:
    // {"system":"canadian","time_control":"canadian","speed":"live","pause_on_weekends":false,"main_time":600,"period_time":180,"stones_per_period":1}

    // Just making sure it works similarly as byoyomi

    // Period Time Live

    it('reject main time live too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 5, main_time: 1, period_time: 40 } });

      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 300;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum Period Time for all the 5 stones for live games in canadian is 50 seconds, please increase Period Time for all the 5 stones, or change the number of stones per period.' }));
    });

    it('accept main time live between min and max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 5, main_time: 1, period_time: 80 } });

      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 300;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, { reject: false });
    });

    it('reject main time live too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 5, main_time: 1, period_time: 1800 } });

      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 300;
      
      const result = conn.checkChallengeMinMax(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum Period Time for all the 5 stones for live games in canadian is 25 minutes, please reduce Period Time for all the 5 stones, or change the number of stones per period.' }));
    });

  });

  // {"system":"fischer","time_control":"fischer","speed":"live","pause_on_weekends":false,"time_increment":10,"initial_time":80,"max_time":120}

  // {"system":"simple","time_control":"simple","speed":"blitz","pause_on_weekends":false,"per_move":5}

  // {"system":"absolute","time_control":"absolute","speed":"correspondence","pause_on_weekends":true,"total_time":2419200}

  // {"system":"none","time_control":"none","speed":"correspondence","pause_on_weekends":false}

});
