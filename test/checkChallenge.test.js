// vim: tw=120 softtabstop=4 shiftwidth=4

const assert = require('assert');

let config;
let connection;
const console = require('../console').console;

const sinon = require('sinon');

const https = require('https');

const { FakeSocket, FakeAPI, base_challenge } = require('./test')

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
    
    const fake_api = new FakeAPI();
    fake_api.request({path: '/foo'}, () => {});
    sinon.stub(https, 'request').callsFake(fake_api.request);
    
    const fake_socket = new FakeSocket();
    conn = new connection.Connection(() => { return fake_socket; }, config);
  });
  
  describe('General rules', () => {
    it('Almost empty config containing only defaults from test.js accepts challenge', () => {
      const notification = base_challenge();
      
      const result = conn.checkChallenge(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

  });

  describe('Bans', () => {
    it('should reject banned users', () => {
      const notification = base_challenge({ user: { username: 'bannedName', id: 5 } });

      config.banned_users[notification.user.username] = true;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'You (bannedName) are not allowed to play games against this bot.' }));
    });
    
    it('should reject banned users by id', () => {
      const notification = base_challenge({ user: { username: 'bannedName', id: 5 } });

      config.banned_users[notification.user.id] = true;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'You (bannedName) are not allowed to play games against this bot.' }));
    });
      
    it('should reject banned ranked users', () => {
      const notification = base_challenge({ ranked: true, user: { username: 'bannedRankedName', id: 6 } });

      config.banned_users_ranked[notification.user.username] = true;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'You (bannedRankedName) are not allowed to play ranked games against this bot.' }));
    });
      
    it('should reject banned ranked users by id', () => {
      const notification = base_challenge({ ranked: true, user: { username: 'bannedRankedName', id: 6 } });

      config.banned_users_ranked[notification.user.id] = true;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'You (bannedRankedName) are not allowed to play ranked games against this bot.' }));
    });
    
    it('should reject banned unranked users', () => {
      const notification = base_challenge({ ranked: false, user: { username: 'bannedUnrankedName', id: 7 } });

      config.banned_users_unranked[notification.user.username] = true;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'You (bannedUnrankedName) are not allowed to play unranked games against this bot.' }));
    });
    
    it('should reject banned unranked users by id', () => {
      const notification = base_challenge({ ranked: false, user: { username: 'bannedUnrankedName', id: 7 } });

      config.banned_users_unranked[notification.user.id] = true;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'You (bannedUnrankedName) are not allowed to play unranked games against this bot.' }));
    });

  });

  describe('Non-square boardsizes', () => {
    it('reject non-square boardsizes if not boardsizes "all"', () => {

      const notification = base_challenge({ ranked: false, width: 19, height: 18 });

      config.boardsizes = "9,13,18,19";

      const result = conn.checkChallengeAllowedFamilies(notification);

      assert.deepEqual(result, ({ reject: true,   msg: 'Board size 19x18 is not square, not allowed.\nPlease choose a SQUARE board size (same width and height), for example try 9x9 or 19x19.' }));

    });

    it('accept non-square boardsizes if boardsizes "all"', () => {

      const notification = base_challenge({ ranked: false, width: 19, height: 18 });

      config.boardsizes             = "all";
      config.allow_all_boardsizes   = true;
      config.allowed_boardsizes     = [];


      const result = conn.checkChallengeAllowedFamilies(notification);

      assert.deepEqual(result, ({ reject: false }));

    });

    it('accept non-square boardsizes if no arg is specified', () => {

      const notification = base_challenge({ ranked: false, width: 19, height: 18 });

      config.allow_all_boardsizes   = false;
      config.allowed_boardsizes     = [];

      const result = conn.checkChallengeAllowedFamilies(notification);

      assert.deepEqual(result, ({ reject: false }));

    });

  });

  describe('Allowed Boardsizes', () => {
    it('reject boardsize not in allowed boardsizes', () => {

      const notification = base_challenge({ ranked: false, width: 18, height: 18 });

      config.boardsizes             = "9,13,19";
      config.allow_all_boardsizes   = false;
      config.allowed_boardsizes     = [];
      config.allowed_boardsizes[9]  = true;
      config.allowed_boardsizes[13] = true;
      config.allowed_boardsizes[19] = true;

      const result = conn.checkChallengeAllowedFamilies(notification);

      assert.deepEqual(result, ({ reject: true,   msg: 'Board size 18x18 is not allowed on this bot, please choose one of these allowed Board sizes:\n9x9, 13x13, 19x19.' }));

    });

    it('accept boardsize in allowed boardsizes', () => {

      const notification = base_challenge({ ranked: false, width: 19, height: 19 });

      config.boardsizes             = "9,13,19";
      config.allow_all_boardsizes   = false;
      config.allowed_boardsizes     = [];
      config.allowed_boardsizes[9]  = true;
      config.allowed_boardsizes[13] = true;
      config.allowed_boardsizes[19] = true;

      const result = conn.checkChallengeAllowedFamilies(notification);

      assert.deepEqual(result, ({ reject: false }));

    });

  });

  describe('Min Max Rank', () => {

    it('reject user ranking too low', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 10 } }); // "20k"

      config.minrank = 17;
      config.maxrank = 32;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'This bot only accepts games from 13k players or stronger ranking.' }));

    });

    it('accept user ranking edge min', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 17 } }); // "13k"

      config.minrank = 17;
      config.maxrank = 32;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('accept user ranking between min and max', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 25 } }); // "5k"

      config.minrank = 17;
      config.maxrank = 32;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('accept user ranking edge max', () => {
      const notification = base_challenge({ ranked: false, user: { ranking: 32 } }); // "3d"

      config.minrank = 17;
      config.maxrank = 32;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('reject user ranking too high', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 35 } }); // "6d"

      config.minrank = 17;
      config.maxrank = 32;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'This bot only accepts games from 3d players or weaker ranking.' }));

    });

    it('reject user ranking too high (9d+)', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 41 } }); // "12d"

      config.minrank = 17;
      config.maxrank = 32;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'This bot only accepts games from 3d players or weaker ranking.' }));

    });

    it('reject user ranking too high (pro)', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 37 } }); // "1p" (1p" = "8d")

      config.minrank = 17;
      config.maxrank = 32;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'This bot only accepts games from 3d players or weaker ranking.' }));
    });
   
  });

  describe('Automatic Handicap and Fakerank', () => {

    it('reject automatic handicap (-1) if noautohandicap and fakerank is not set', () => {

      const notification = base_challenge({ ranked: false, handicap: -1 });

      config.noautohandicap = true;
      
      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: '-Automatic- handicap is not allowed on this bot, please manually select the number of handicap stones in -custom- handicap.' }));

    });

    it('do not reject automatic handicap (-1) if fakerank is set', () => {

      const notification = base_challenge({ ranked: false, handicap: -1 });

      config.fakerank    = 29; // "1k"
      
      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('reject automatic handicap (-1) if both noautohandicap and fakerank are set', () => {

      const notification = base_challenge({ ranked: false, handicap: -1 });

      config.noautohandicap = true;
      config.fakerank       = 29; // "1k"
      
      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: '-Automatic- handicap is not allowed on this bot, please manually select the number of handicap stones in -custom- handicap.' }));

    });

    it('reject automatic handicap (-1) if fakerank is set but estimated handicap stones are too low', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 30 }, handicap: -1 }); // "1d"

      config.fakerank    = 29; // "1k"
      // "1d" - "1k" = 30 - 29 = 1 automatic handicap stones
      config.minhandicap = 2;
      config.maxhandicap = 4;
      
      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum number of handicap stones is 2, please increase the number of handicap stones.' }));

    });

    it('accept automatic handicap (-1) if fakerank is set and estimated handicap stones are edge min', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 31 }, handicap: -1 }); // "2d"

      config.fakerank    = 29; // "1k"
      // "2d" - "1k" = 31 - 29 = 2 automatic handicap stones
      config.minhandicap = 2;
      config.maxhandicap = 4;
      
      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('accept automatic handicap (-1) if fakerank is set and estimated handicap stones are between min and max', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 26 }, handicap: -1 }); // "4k"

      config.fakerank    = 29; // "1k"
      // "4k" - "1k" = 26 - 29 = 3 automatic handicap stones
      config.minhandicap = 2;
      config.maxhandicap = 4;
      
      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('accept automatic handicap (-1) if fakerank is set and estimated handicap stones are edge max', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 25 }, handicap: -1 }); // "5k"

      config.fakerank    = 29; // "1k"
      // "5k" - "1k" = 25 - 29 = 4 automatic handicap stones
      config.minhandicap = 2;
      config.maxhandicap = 4;
      
      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('reject automatic handicap (-1) if fakerank is set but estimated handicap stones are too high', () => {

      const notification = base_challenge({ ranked: false, user: { ranking: 30 }, handicap: -1 }); // "1d"

      config.fakerank    = 20; // "10k"
      // "10k" - "1d" = 30 - 20 = 10 automatic handicap stones
      config.minhandicap = 2;
      config.maxhandicap = 4;
      
      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum number of handicap stones is 4, please reduce the number of handicap stones.' }));

    });

  });

  describe('Handicap', () => {

    it('reject handicap too low (handicap games only)', () => {

      const notification = base_challenge({ ranked: false, handicap: 0 });

      config.noautohandicap = true;
      config.minhandicap = 2;
      config.maxhandicap = 6;
      
      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum number of handicap stones is 2, please increase the number of handicap stones (handicap games only).' }));

    });

    it('accept handicap edge min', () => {

      const notification = base_challenge({ ranked: false, handicap: 0 });

      config.noautohandicap = true;
      config.minhandicap = 0;
      config.maxhandicap = 6;
      
      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('accept handicap between min and max', () => {

      const notification = base_challenge({ ranked: false, handicap: 1 });

      config.noautohandicap = true;
      config.minhandicap = 0;
      config.maxhandicap = 6;
      
      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('accept handicap edge max', () => {

      const notification = base_challenge({ ranked: false, handicap: 6 });

      config.noautohandicap = true;
      config.minhandicap = 0;
      config.maxhandicap = 6;
      
      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('reject handicap too high (even games only) ', () => {

      const notification = base_challenge({ ranked: false, handicap: 1 });

      config.noautohandicap = true;
      config.minhandicap = 0;
      config.maxhandicap = 0;
      
      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum number of handicap stones is 0, please reduce the number of handicap stones (no handicap games).' }));

    });

    it('reject handicap too high ', () => {

      const notification = base_challenge({ ranked: false, handicap: 9 });

      config.noautohandicap = true;
      config.minhandicap = 0;
      config.maxhandicap = 6;
      
      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum number of handicap stones is 6, please reduce the number of handicap stones.' }));

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
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum Main Time for blitz games in byoyomi is 10 seconds, please increase Main Time.' }));
    });

    it('accept main time blitz edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 10, periods: 1, period_time: 1 } });

      config.minmaintimeblitz = 10;
      config.maxmaintimeblitz = 30;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept main time blitz between min and max ', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 20, periods: 1, period_time: 1 } });

      config.minmaintimeblitz = 10;
      config.maxmaintimeblitz = 30;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept main time blitz edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 30, periods: 1, period_time: 1 } });

      config.minmaintimeblitz = 10;
      config.maxmaintimeblitz = 30;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept main time blitz too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 31, periods: 1, period_time: 1 } });

      config.minmaintimeblitz = 10;
      config.maxmaintimeblitz = 30;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum Main Time for blitz games in byoyomi is 30 seconds, please reduce Main Time.' }));
    });

    // Periods Blitz

    it('reject number of periods blitz too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 1, period_time: 1 } });

      config.minperiodsblitz = 3;
      config.maxperiodsblitz = 20;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum number of periods for blitz games in byoyomi is 3, please increase the number of periods.' }));
    });

    it('accept number of periods blitz edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 3, period_time: 1 } });

      config.minperiodsblitz = 3;
      config.maxperiodsblitz = 20;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept number of periods blitz between min and max ', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 12, period_time: 1 } });

      config.minperiodsblitz = 3;
      config.maxperiodsblitz = 20;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept number of periods blitz edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 20, period_time: 1 } });

      config.minperiodsblitz = 3;
      config.maxperiodsblitz = 20;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept number of periods blitz too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 100, period_time: 1 } });

      config.minperiodsblitz = 3;
      config.maxperiodsblitz = 20;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum number of periods for blitz games in byoyomi is 20, please reduce the number of periods.' }));
    });

    // Period Time Blitz

    it('reject period time blitz too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 1, period_time: 1 } });

      config.minperiodtimeblitz = 5;
      config.maxperiodtimeblitz = 15;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: `Minimum Period Time for blitz games in byoyomi is 5 seconds, please increase Period Time.` }));
    });

    it('accept period time blitz edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 1, period_time: 5 } });

      config.minperiodtimeblitz = 5;
      config.maxperiodtimeblitz = 15;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept period time blitz between min and max ', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 1, period_time: 11 } });

      config.minperiodtimeblitz = 5;
      config.maxperiodtimeblitz = 15;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept period time blitz edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 1, period_time: 15 } });

      config.minperiodtimeblitz = 5;
      config.maxperiodtimeblitz = 15;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept period time blitz too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 1, period_time: 22 } });

      config.minperiodtimeblitz = 5;
      config.maxperiodtimeblitz = 15;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum Period Time for blitz games in byoyomi is 15 seconds, please reduce Period Time.' }));
    });

    // Main Time Live

    it('reject main time live too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 1, period_time: 1 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 300;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum Main Time for live games in byoyomi is 1 minutes, please increase Main Time.' }));
    });
  
    it('accept main time live edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 60, periods: 1, period_time: 1 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 300;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });
  
    it('accept main time live between min and max ', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 180, periods: 1, period_time: 1 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 300;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });
  
    it('accept main time live edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 300, periods: 1, period_time: 1 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 300;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });
  
    it('accept main time live too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 301, periods: 1, period_time: 1 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 300;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum Main Time for live games in byoyomi is 5 minutes, please reduce Main Time.' }));
    });
  
    // Periods Live
  
    it('reject number of periods live too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 1, period_time: 1 } });
  
      config.minperiodslive = 3;
      config.maxperiodslive = 20;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum number of periods for live games in byoyomi is 3, please increase the number of periods.' }));
    });
  
    it('accept number of periods live edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 3, period_time: 1 } });
  
      config.minperiodslive = 3;
      config.maxperiodslive = 20;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });
  
    it('accept number of periods live between min and max ', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 12, period_time: 1 } });
  
      config.minperiodslive = 3;
      config.maxperiodslive = 20;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });
  
    it('accept number of periods live edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 20, period_time: 1 } });
  
      config.minperiodslive = 3;
      config.maxperiodslive = 20;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });
  
    it('accept number of periods live too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 100, period_time: 1 } });
  
      config.minperiodslive = 3;
      config.maxperiodslive = 20;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum number of periods for live games in byoyomi is 20, please reduce the number of periods.' }));
    });
  
    // Period Time Live
  
    it('reject period time live too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 1, period_time: 1 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 120;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: `Minimum Period Time for live games in byoyomi is 10 seconds, please increase Period Time.` }));
    });
  
    it('accept period time live edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 1, period_time: 10 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 120;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });
  
    it('accept period time live between min and max ', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 1, period_time: 30 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 120;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });
  
    it('accept period time live edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 1, period_time: 120 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 120;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });
  
    it('accept period time live too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 1, period_time: 121 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 120;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum Period Time for live games in byoyomi is 2 minutes, please reduce Period Time.' }));
    });

    // Main Time Correspondence

    it('reject main time correspondence too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 1, period_time: 1 } });

      config.minmaintimecorr = 259200;
      config.maxmaintimecorr = 604800;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum Main Time for correspondence games in byoyomi is 3 days, please increase Main Time.' }));
    });

    it('accept main time correspondence edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 259200, periods: 1, period_time: 1 } });

      config.minmaintimecorr = 259200;
      config.maxmaintimecorr = 604800;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept main time correspondence between min and max ', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 454600, periods: 1, period_time: 1 } });

      config.minmaintimecorr = 259200;
      config.maxmaintimecorr = 604800;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept main time correspondence edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 604800, periods: 1, period_time: 1 } });

      config.minmaintimecorr = 259200;
      config.maxmaintimecorr = 604800;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept main time correspondence too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 604801, periods: 1, period_time: 1 } });

      config.minmaintimecorr = 259200;
      config.maxmaintimecorr = 604800;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum Main Time for correspondence games in byoyomi is 7 days, please reduce Main Time.' }));
    });

    // Periods Correspondence

    it('reject number of periods correspondence too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 1, period_time: 1 } });

      config.minperiodscorr = 3;
      config.maxperiodscorr = 10;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum number of periods for correspondence games in byoyomi is 3, please increase the number of periods.' }));
    });

    it('accept number of periods correspondence edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 3, period_time: 1 } });

      config.minperiodscorr = 3;
      config.maxperiodscorr = 10;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept number of periods correspondence between min and max ', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 5, period_time: 1 } });

      config.minperiodscorr = 3;
      config.maxperiodscorr = 10;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept number of periods correspondence edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 10, period_time: 1 } });

      config.minperiodscorr = 3;
      config.maxperiodscorr = 10;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept number of periods correspondence too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 25, period_time: 1 } });

      config.minperiodscorr = 3;
      config.maxperiodscorr = 10;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum number of periods for correspondence games in byoyomi is 10, please reduce the number of periods.' }));
    });

    // Period Time Correspondence

    it('reject period time correspondence too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 1, period_time: 1 } });

      config.minperiodtimecorr = 14400;
      config.maxperiodtimecorr = 259200;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: `Minimum Period Time for correspondence games in byoyomi is 4 hours, please increase Period Time.` }));
    });

    it('accept period time correspondence edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 1, period_time: 14400 } });

      config.minperiodtimecorr = 14400;
      config.maxperiodtimecorr = 259200;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept period time correspondence between min and max ', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 1, period_time: 60000 } });

      config.minperiodtimecorr = 14400;
      config.maxperiodtimecorr = 259200;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept period time correspondence edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 1, period_time: 259200 } });

      config.minperiodtimecorr = 14400;
      config.maxperiodtimecorr = 259200;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept period time correspondence too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 1, period_time: 512000 } });

      config.minperiodtimecorr = 14400;
      config.maxperiodtimecorr = 259200;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum Period Time for correspondence games in byoyomi is 3 days, please reduce Period Time.' }));
    });

  });

  describe('Some time controls have no main time, do not check maintime', () => {

    it('simple timecontrol accepts any main time, even if too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "simple", time_control: "simple", speed: "live", per_move: 1 } });

      config.minmaintimelive = 60;
      config.maxmaintimelive = 300;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('simple timecontrol accepts any main time, even if between min and max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "simple", time_control: "simple", speed: "live", per_move: 180 } });

      config.minmaintimelive = 60;
      config.maxmaintimelive = 300;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('simple timecontrol accepts any main time, even if too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "simple", time_control: "simple", speed: "live", per_move: 9999 } });

      config.minmaintimelive = 60;
      config.maxmaintimelive = 300;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });
    
  });

  describe('Non-Byoyomi time controls have no period time, do not check periods', () => {

    it('canadian timecontrol accepts any periods number, even if too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 1, main_time: 1, period_time: 1 } });

      config.minperiodslive = 3;
      config.maxperiodslive = 20;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('canadian timecontrol accepts any periods number, even if between min and mix', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 10, main_time: 10, period_time: 10 } });

      config.minperiodslive = 3;
      config.maxperiodslive = 20;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('canadian timecontrol accepts any periods number, even if too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 99, main_time: 99, period_time: 99 } });

      config.minperiodslive = 3;
      config.maxperiodslive = 20;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

  });

  describe('Some time controls have no period time, do not check periodtime', () => {

    it('absolute timecontrol accepts any period time, even if too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "absolute", time_control: "absolute", speed: "correspondence", total_time: 1 } });

      config.minperiodtimelive = 30;
      config.maxperiodtimelive = 120;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('absolute timecontrol accepts any period time, even if between min and max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "absolute", time_control: "absolute", speed: "correspondence", total_time: 80 } });

      config.minperiodtimelive = 30;
      config.maxperiodtimelive = 120;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('absolute timecontrol accepts any period time, even if too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "absolute", time_control: "absolute", speed: "correspondence", total_time: 999 } });

      config.minperiodtimelive = 30;
      config.maxperiodtimelive = 120;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });
    
  });

  describe('None time control has no main time, no periods, and no period time, do not check any time setting', () => {

    // "none" exists only in "correspondence" games

    // sample:
    // {"system":"none","time_control":"none","speed":"correspondence","pause_on_weekends":false}

    it('none time control accepts any period time, even if config is empty of time settings', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "none", time_control: "none", speed: "correspondence" } });
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('none time control accepts any period time, even if config is full of time settings', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "none", time_control: "none", speed: "correspondence" } });

      config.minmaintimecorr   = 20000;
      config.maxmaintimecorr   = 80000;
      config.minperiodscorr    = 3;
      config.maxmaintimecorr   = 10;
      config.minperiodtimecorr = 2000;
      config.maxperiodtimecorr = 8000;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

  });

  describe('Canadian time settings', () => {

    // sample:
    // {"system":"canadian","time_control":"canadian","speed":"live","pause_on_weekends":false,"main_time":600,"period_time":180,"stones_per_period":1}

    // Just making sure it works similarly as byoyomi, so testing only "live" speed.

    // Main time

    it('reject main time live too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 5, main_time: 59, period_time: 1 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 1800;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum Main Time for live games in canadian is 1 minutes, please increase Main Time.' }));
    });
  
    it('accept main time stones live edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 5, main_time: 60, period_time: 80 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 1800;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });
  
    it('accept main time live between min and max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 5, main_time: 120, period_time: 80 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 1800;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });
  
    it('accept main time live edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 5, main_time: 1800, period_time: 80 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 1800;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });
  
    it('reject main time live too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 5, main_time: 1801, period_time: 1800 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 1800;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum Main Time for live games in canadian is 30 minutes, please reduce Main Time.' }));
    });

    // Periods are not checked for non-byoyomi time controls

    // Period Time (Period Time for all the X Stones)

    it('reject period time for all the stones live too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 5, main_time: 1, period_time: 74 } });

      config.minperiodtimelive = 15;  // 15 seconds per stone * 5 stones = 75   = 1 minutes 15 seconds for all the 5 stones
      config.maxperiodtimelive = 300; // 5  minutes per stone * 5 stones = 1500 = 25 minutes           for all the 5 stones
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum Period Time for all the 5 stones for live games in canadian is 1 minutes 15 seconds, please increase Period Time for all the 5 stones, or change the number of stones per period.' }));
    });

    it('accept period time for all the stones live edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 5, main_time: 1, period_time: 75 } });

      config.minperiodtimelive = 15;  // 15 seconds per stone * 5 stones = 75   = 1 minutes 15 seconds for all the 5 stones
      config.maxperiodtimelive = 300; // 5  minutes per stone * 5 stones = 1500 = 25 minutes           for all the 5 stones
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });

    it('accept period time for all the stones live between min and max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 5, main_time: 1, period_time: 120 } });

      config.minperiodtimelive = 15;  // 15 seconds per stone * 5 stones = 75   = 1 minutes 15 seconds for all the 5 stones
      config.maxperiodtimelive = 300; // 5  minutes per stone * 5 stones = 1500 = 25 minutes           for all the 5 stones
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });

    it('accept period time for all the stones live edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 5, main_time: 1, period_time: 1500 } });

      config.minperiodtimelive = 15;  // 15 seconds per stone * 5 stones = 75   = 1 minutes 15 seconds for all the 5 stones
      config.maxperiodtimelive = 300; // 5  minutes per stone * 5 stones = 1500 = 25 minutes           for all the 5 stones
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });

    it('reject period time for all the stones live too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 5, main_time: 1, period_time: 1501 } });

      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 300;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum Period Time for all the 5 stones for live games in canadian is 25 minutes, please reduce Period Time for all the 5 stones, or change the number of stones per period.' }));
    });

  });

  describe('Fischer time settings', () => {

    // sample:
    // {"system":"fischer","time_control":"fischer","speed":"live","pause_on_weekends":false,"time_increment":10,"initial_time":80,"max_time":120}

    // Just making sure it works similarly as byoyomi, so testing only "live" speed.

    // Main Time 1 (Initial time)

    it('reject main time 1 (initial time) too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "fischer", time_control: "fischer", speed: "live", time_increment: 1, initial_time: 59, max_time: 59 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 1800;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum Initial Time for live games in fischer is 1 minutes, please increase Initial Time.' }));
    });
  
    it('accept main time 1 (initial time) edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "fischer", time_control: "fischer", speed: "live", time_increment: 1, initial_time: 60, max_time: 60 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 1800;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });
  
    it('accept main time 1 (initial time) between min and max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "fischer", time_control: "fischer", speed: "live", time_increment: 1, initial_time: 900, max_time: 900 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 1800;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });
  
    it('accept main time 1 (initial time) edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "fischer", time_control: "fischer", speed: "live", time_increment: 1, initial_time: 1800, max_time: 1800 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 1800;

      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });
  
    it('reject main time 1 (initial time) too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "fischer", time_control: "fischer", speed: "live", time_increment: 1, initial_time: 1801, max_time: 1801 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 1800;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum Initial Time for live games in fischer is 30 minutes, please reduce Initial Time.' }));
    });

    // Main Time 2 (Max Time)

    it('accept main time 2 (max time) edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "fischer", time_control: "fischer", speed: "live", time_increment: 1, initial_time: 900, max_time: 1800 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 1800;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });
  
    it('reject main time 2 (max time) too high, even if main time 1 (initial time) is accepted', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "fischer", time_control: "fischer", speed: "live", time_increment: 1, initial_time: 900, max_time: 1801 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 1800;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum Max Time for live games in fischer is 30 minutes, please reduce Max Time.' }));
    });

    // Periods are not checked for non-byoyomi time controls

    // Period Time (Increment Time)

    it('reject period time (increment time) too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "fischer", time_control: "fischer", speed: "live", time_increment: 9, initial_time: 1, max_time: 1 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 130;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum Increment Time for live games in fischer is 10 seconds, please increase Increment Time.' }));
    });
  
    it('accept period time (increment time) edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "fischer", time_control: "fischer", speed: "live", time_increment: 10, initial_time: 1, max_time: 1 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 130;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });
  
    it('accept period time (increment time) between min and max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "fischer", time_control: "fischer", speed: "live", time_increment: 70, initial_time: 1, max_time: 1 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 130;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });
  
    it('accept period time (increment time) edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "fischer", time_control: "fischer", speed: "live", time_increment: 130, initial_time: 1, max_time: 1 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 130;
  
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });
  
    it('reject period time (increment time) too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "fischer", time_control: "fischer", speed: "live", time_increment: 131, initial_time: 1, max_time: 1 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 130;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum Increment Time for live games in fischer is 2 minutes 10 seconds, please reduce Increment Time.' }));
    });

  });

  describe('Simple time settings', () => {

    // sample:
    // {"system":"simple","time_control":"simple","speed":"blitz","pause_on_weekends":false,"per_move":5}

    // Just making sure it works similarly as byoyomi, so testing only "live" speed.

    // Main Time is not checked for simple time control

    // Periods are not checked for non-byoyomi time controls

    // Period Time (Time per move)

    it('reject period time (time per move) too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "simple", time_control: "simple", speed: "live", per_move: 9 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 130;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum Time per move for live games in simple is 10 seconds, please increase Time per move.' }));
    });
  
    it('accept period time (time per move) edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "simple", time_control: "simple", speed: "live", per_move: 10 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 130;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });
  
    it('accept period time (time per move) between min and max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "simple", time_control: "simple", speed: "live", per_move: 70 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 130;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });
  
    it('accept period time (time per move) edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "simple", time_control: "simple", speed: "live", per_move: 130 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 130;
  
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });
  
    it('reject period time (time per move) too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "simple", time_control: "simple", speed: "live", per_move: 131 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 130;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum Time per move for live games in simple is 2 minutes 10 seconds, please reduce Time per move.' }));
    });
  
  });

  describe('Absolute time settings', () => {

    // sample:
    // {"system":"absolute","time_control":"absolute","speed":"correspondence","pause_on_weekends":true,"total_time":2419200}

    // Just making sure it works similarly as byoyomi, so testing only "live" speed.

    // Main Time (Total time)

    it('reject main time (total time) too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "absolute", time_control: "absolute", speed: "live", total_time: 351 } });
  
      config.minmaintimelive = 352;
      config.maxmaintimelive = 4127;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum Total Time for live games in absolute is 5 minutes 52 seconds, please increase Total Time.' }));
    });
  
    it('accept main time (total time) edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "absolute", time_control: "absolute", speed: "live", total_time: 352 } });
  
      config.minmaintimelive = 352;
      config.maxmaintimelive = 4127;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });
  
    it('accept main time (total time) between min and max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "absolute", time_control: "absolute", speed: "live", total_time: 1249 } });
  
      config.minmaintimelive = 352;
      config.maxmaintimelive = 4127;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });
  
    it('accept main time (total time) edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "absolute", time_control: "absolute", speed: "live", total_time: 4127 } });
  
      config.minmaintimelive = 352;
      config.maxmaintimelive = 4127;
  
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });
  
    it('reject main time (total time) too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "absolute", time_control: "absolute", speed: "live", total_time: 4128 } });
  
      config.minmaintimelive = 352;
      config.maxmaintimelive = 4127;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum Total Time for live games in absolute is 1 hours 8 minutes 47 seconds, please reduce Total Time.' }));
    });

    // Periods are not checked for non-byoyomi time controls

    // Period Time is not checked for absolute time control

  });

  describe('Min Max General Ranked Unranked precdecence rules', () => {

    // We already tested extensively how the min max args work, so now we just want to
    // make sure the general / ranked / unranked priority order is respected.
    // MinMax handicap is a good and simple example

    it('reject handicap based on ranked arg if ranked arg is used and game is ranked', () => {

      const notification = base_challenge({ ranked: true, handicap: 8 });

      config.noautohandicap         = true;
      config.noautohandicapranked   = true;
      config.noautohandicapunranked = true;
      config.minhandicap            = 0;
      config.maxhandicap            = 2;
      config.minhandicapranked      = 4;
      config.maxhandicapranked      = 6;
      config.minhandicapunranked    = 8;
      config.maxhandicapunranked    = 10;
      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Maximum number of handicap stones for ranked games is 6, please reduce the number of handicap stones.\nYou may try unranked.' }));

    });

    it('accept handicap based on ranked arg if ranked arg is used and game is ranked', () => {

      const notification = base_challenge({ ranked: true, handicap: 5 });

      config.noautohandicap         = true;
      config.noautohandicapranked   = true;
      config.noautohandicapunranked = true;
      config.minhandicap         = 0;
      config.maxhandicap         = 2;
      config.minhandicapranked   = 4;
      config.maxhandicapranked   = 6;
      config.minhandicapunranked = 8;
      config.maxhandicapunranked = 10;
      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('reject handicap based on unranked arg if unranked arg is used and game is unranked', () => {

      const notification = base_challenge({ ranked: false, handicap: 7 });

      config.noautohandicap         = true;
      config.noautohandicapranked   = true;
      config.noautohandicapunranked = true;
      config.minhandicap         = 0;
      config.maxhandicap         = 2;
      config.minhandicapranked   = 4;
      config.maxhandicapranked   = 6;
      config.minhandicapunranked = 8;
      config.maxhandicapunranked = 10;
      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: true,   msg: 'Minimum number of handicap stones for unranked games is 8, please increase the number of handicap stones.\nYou may try ranked.' }));

    });

    it('accept handicap based on unranked arg if unranked arg is used and game is unranked', () => {

      const notification = base_challenge({ ranked: false, handicap: 9 });

      config.noautohandicap         = true;
      config.noautohandicapranked   = true;
      config.noautohandicapunranked = true;
      config.minhandicap         = 0;
      config.maxhandicap         = 2;
      config.minhandicapranked   = 4;
      config.maxhandicapranked   = 6;
      config.minhandicapunranked = 8;
      config.maxhandicapunranked = 10;
      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

  });

});
