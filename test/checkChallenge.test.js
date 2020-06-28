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

    it('accept default notification from base_challenge in test.js, with almost empty config and game is ranked', () => {
      const notification = base_challenge();
      
      // default for notification.ranked is true in test.js
      const result = conn.checkChallenge(notification, "ranked");
      
      assert.deepEqual(result, ({ reject: false }));
    });

  });

  describe('Sanity Checks', () => {

    it('accept real notification challenge with almost empty config (except defaults from base_challenge in test.js)', () => {
      // notification sample as of 24 june 2020
      const notificationSample = {"id":"787:118a6213-4371-4fbf-9574-11c8016e86d8","type":"challenge","player_id":787,
      "timestamp":1593029394,"read_timestamp":0,"read":0,"aux_delivered":0,
      "game_id":8374,"challenge_id":4878,
      "user":{"id":786,"country":"un","username":"testuser",
      "icon_url":"https://b0c2ddc39d13e1c0ddad-93a52a5bc9e7cc06050c1a999beb3694.ssl.cf1.rackcdn.com/6c89b5fd5c1965608d50d4f9b4829078-32.png",
      "ratings":{"overall":{"rating":1190.1419101664915,"deviation":147.528546071068,"volatility":0.06006990721444128}},
      "ui_class":"","professional":false,"rating":"1190.142","ranking":10.51848380474934},
      "rules":"chinese","ranked":false,"aga_rated":false,"disable_analysis":false,
      "handicap":0,"komi":null,
      "time_control":{"system":"fischer","time_control":"fischer","speed":"live",
      "pause_on_weekends":false,
      "time_increment":30,"initial_time":120,"max_time":300},
      "challenger_color":"automatic","width":19,"height":19};

      const notification = base_challenge(notificationSample);
      
      const result = conn.checkChallenge(notification, "ranked");
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('reject empty notification challenge', () => {
    const notification = {};
    
    const result = conn.checkChallenge(notification, "ranked");
    
    assert.deepEqual(result, ({ reject: true, msg: 'Missing key user, cannot check challenge, please contact my bot admin.' }));
    });

  });

  describe('Banned usernames', () => {
    it('reject banned usernames for all games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.username = "bannedName";

      config.ranked.bannedusernames.banned[notification.user.username] = true;
      config.unranked.bannedusernames.banned[notification.user.username] = true;
      
      const result = conn.checkChallengeUser(notification, "ranked");
      
      assert.deepEqual(result, ({ reject: true, reason: 'You (user name bannedName) are banned on this bot.' }));
    });
    
    it('reject banned usernames for all games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.username = "bannedName";

      config.ranked.bannedusernames.banned[notification.user.username] = true;
      config.unranked.bannedusernames.banned[notification.user.username] = true;
      
      const result = conn.checkChallengeUser(notification, "unranked");
      
      assert.deepEqual(result, ({ reject: true, reason: 'You (user name bannedName) are banned on this bot.' }));
    });

    it('reject banned usernames for ranked games', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.username = "bannedName";

      config.ranked.bannedusernames.banned[notification.user.username] = true;
      
      const result = conn.checkChallengeUser(notification, "ranked");
      
      assert.deepEqual(result, ({ reject: true, reason: 'You (user name bannedName) are banned from ranked games on this bot.\nYou cannot change the ranked setting, but the same setting in an unranked game will be accepted.' }));
    });

    it('reject banned usernames for unranked games', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.username = "bannedName";

      config.unranked.bannedusernames.banned[notification.user.username] = true;
      
      const result = conn.checkChallengeUser(notification, "unranked");
      
      assert.deepEqual(result, ({ reject: true, reason: 'You (user name bannedName) are banned from unranked games on this bot.\nYou cannot change the unranked setting, but the same setting in an ranked game will be accepted.' }));
    });

    it('accept unranked banned usernames users for ranked games', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.username = "bannedName";

      config.unranked.bannedusernames.banned[notification.user.username] = true;
      
      const result = conn.checkChallengeUser(notification, "ranked");
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept ranked banned usernames for unranked games', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.username = "bannedName";

      config.ranked.bannedusernames.banned[notification.user.username] = true;
      
      const result = conn.checkChallengeUser(notification, "unranked");
      
      assert.deepEqual(result, ({ reject: false }));
    });
  });

  describe('Banned userids', () => {

    it('reject banned ids for all games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.id = "bannedId";
  
      config.ranked.banneduserids.banned[notification.user.id] = true;
      config.unranked.banneduserids.banned[notification.user.id] = true;
      
      const result = conn.checkChallengeUser(notification, "ranked");
      
      assert.deepEqual(result, ({ reject: true, reason: 'You (user id bannedId) are banned on this bot.' }));
    });

    it('reject banned ids for all games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.id = "bannedId";
  
      config.ranked.banneduserids.banned[notification.user.id] = true;
      config.unranked.banneduserids.banned[notification.user.id] = true;
      
      const result = conn.checkChallengeUser(notification, "unranked");
      
      assert.deepEqual(result, ({ reject: true, reason: 'You (user id bannedId) are banned on this bot.' }));
    });
    
    it('reject banned ids for ranked games', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.id = "bannedId";
  
      config.ranked.banneduserids.banned[notification.user.id] = true;
      
      const result = conn.checkChallengeUser(notification, "ranked");
      
      assert.deepEqual(result, ({ reject: true, reason: 'You (user id bannedId) are banned from ranked games on this bot.\nYou cannot change the ranked setting, but the same setting in an unranked game will be accepted.' }));
    });

    it('reject banned ids for unranked games', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.id = "bannedId";
  
      config.unranked.banneduserids.banned[notification.user.id] = true;
      
      const result = conn.checkChallengeUser(notification, "unranked");
      
      assert.deepEqual(result, ({ reject: true, reason: 'You (user id bannedId) are banned from unranked games on this bot.\nYou cannot change the unranked setting, but the same setting in an ranked game will be accepted.' }));
    });
  
    it('accept unranked banned ids users for ranked games', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.id = "bannedId";
  
      config.unranked.banneduserids.banned[notification.user.id] = true;
      
      const result = conn.checkChallengeUser(notification, "ranked");
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept ranked banned ids for unranked games', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.id = "bannedId";
  
      config.ranked.banneduserids.banned[notification.user.id] = true;
      
      const result = conn.checkChallengeUser(notification, "unranked");
      
      assert.deepEqual(result, ({ reject: false }));
    });

  });

  describe('User is professional', () => {
    it('reject user not professional for all games and game is ranked', () => {
      const notification = base_challenge({ professional: false, ranked: true });

      config.ranked.proonly = true;
      config.unranked.proonly = true;
      
      const result = conn.checkChallengeUser(notification, "ranked");
      
      assert.deepEqual(result, ({ reject: true, reason: 'Games against non-professionals are not allowed on this bot.' }));
    });

    it('reject user not professional for all games and game is unranked', () => {
      const notification = base_challenge({ professional: false, ranked: false });

      config.ranked.proonly = true;
      config.unranked.proonly = true;
      
      const result = conn.checkChallengeUser(notification, "unranked");
      
      assert.deepEqual(result, ({ reject: true, reason: 'Games against non-professionals are not allowed on this bot.' }));
    });
    
    it('reject user not professional for ranked games', () => {
      const notification = base_challenge({ professional: false, ranked: true });

      config.ranked.proonly = true;
      
      const result = conn.checkChallengeUser(notification, "ranked");
      
      assert.deepEqual(result, ({ reject: true, reason: 'Games against non-professionals are not allowed on this bot for ranked games.\nYou cannot change the ranked setting, but the same setting in an unranked game will be accepted.' }));
    });

    it('reject user not professional for unranked games', () => {
      const notification = base_challenge({ professional: false, ranked: false });

      config.unranked.proonly = true;
      
      const result = conn.checkChallengeUser(notification, "unranked");
      
      assert.deepEqual(result, ({ reject: true, reason: 'Games against non-professionals are not allowed on this bot for unranked games.\nYou cannot change the unranked setting, but the same setting in an ranked game will be accepted.' }));
    });

    it('accept user not professional for ranked games and game is unranked', () => {
      const notification = base_challenge({ professional: false, ranked: false });

      config.ranked.proonly = true;
      
      const result = conn.checkChallengeUser(notification, "unranked");
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept user not professional for unranked games and game is ranked', () => {
      const notification = base_challenge({ professional: false, ranked: true });

      config.unranked.proonly = true;
      
      const result = conn.checkChallengeUser(notification, "ranked");
      
      assert.deepEqual(result, ({ reject: false }));
    });

  });

  describe('Min rank', () => {

    it ('reject min rank too low (0) for all games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 0; // "30k"

      config.ranked.minrank = 17; // "13k"
      config.unranked.minrank = 17; // "13k"

      const result = conn.checkChallengeUser(notification, "ranked");

      assert.deepEqual(result, ({ reject: true, reason: 'Minimum rank is 13k.' }));

    });

    it ('reject min rank too low (0) for all games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 0; // "30k"

      config.ranked.minrank = 17; // "13k"
      config.unranked.minrank = 17; // "13k"

      const result = conn.checkChallengeUser(notification, "unranked");

      assert.deepEqual(result, ({ reject: true, reason: 'Minimum rank is 13k.' }));

    });

    it ('reject min rank too low for all games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 29; // "1k"

      config.ranked.minrank = 30; // "1d" or "0k"
      config.unranked.minrank = 30; // "1d" or "0k"

      const result = conn.checkChallengeUser(notification, "ranked");

      assert.deepEqual(result, ({ reject: true, reason: 'Minimum rank is 1d.' }));

    });

    it ('reject min rank too low for all games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 5; // "25k"

      config.ranked.minrank = 30; // 1d" or "0k"
      config.unranked.minrank = 30; // "1d" or "0k"

      const result = conn.checkChallengeUser(notification, "unranked");

      assert.deepEqual(result, ({ reject: true, reason: 'Minimum rank is 1d.' }));

    });

    it ('reject min rank too low (8d+) for all games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 37; // "8d"
      notification.user.professional = false;

      config.ranked.minrank = 38; // "9d"
      config.unranked.minrank = 38; // "9d"

      const result = conn.checkChallengeUser(notification, "ranked");

      assert.deepEqual(result, ({ reject: true, reason: 'Minimum rank is 9d.' }));

    });

    it ('reject min rank too low (8d+) for all games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 37; // "8d"
      notification.user.professional = false;

      config.ranked.minrank = 38; // "9d"
      config.unranked.minrank = 38; // "9d"

      const result = conn.checkChallengeUser(notification, "unranked");

      assert.deepEqual(result, ({ reject: true, reason: 'Minimum rank is 9d.' }));

    });

    it ('reject min rank too low (pro) for all games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 37; // "1p/8d"
      notification.user.professional = true;

      config.ranked.minrank = 38; // "2p/9d"
      config.unranked.minrank = 38; // "2p/9d"

      const result = conn.checkChallengeUser(notification, "ranked");

      assert.deepEqual(result, ({ reject: true, reason: 'Minimum rank is 2p=9d.' }));

    });

    it ('reject min rank too low (pro) for all games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 37; // "1p/8d"
      notification.user.professional = true;

      config.ranked.minrank = 38; // "2p/9d"
      config.unranked.minrank = 38; // "2p/9d"

      const result = conn.checkChallengeUser(notification, "unranked");

      assert.deepEqual(result, ({ reject: true, reason: 'Minimum rank is 2p=9d.' }));

    });

    it ('accept min rank edge min for all games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 17; // "13k"

      config.ranked.minrank = 17; // "13k"
      config.unranked.minrank = 17; // "13k"

      const result = conn.checkChallengeUser(notification, "ranked");

      assert.deepEqual(result, ({ reject: false }));

    });

    it ('accept min rank edge min for all games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 17; // "13k"

      config.ranked.minrank = 17; // "13k"
      config.unranked.minrank = 17; // "13k"

      const result = conn.checkChallengeUser(notification, "unranked");

      assert.deepEqual(result, ({ reject: false }));

    });

    it ('accept min rank high enough for all games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 18; // "12k"

      config.ranked.minrank = 17; // "13k"
      config.unranked.minrank = 17; // "13k"

      const result = conn.checkChallengeUser(notification, "ranked");

      assert.deepEqual(result, ({ reject: false }));

    });

    it ('accept min rank high enough for all games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 18; // "12k"

      config.ranked.minrank = 17; // "13k"
      config.unranked.minrank = 17; // "13k"

      const result = conn.checkChallengeUser(notification, "unranked");

      assert.deepEqual(result, ({ reject: false }));

    });

    it ('accept min rank high enough (8d+) for all games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 38; // "9d"
      notification.user.professional = false;

      config.ranked.minrank = 37; // 8d"
      config.unranked.minrank = 37; // "8d"

      const result = conn.checkChallengeUser(notification, "ranked");

      assert.deepEqual(result, ({ reject: false }));

    });

    it ('accept min rank high enough (8d+) for all games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 38; // "9d"
      notification.user.professional = false;

      config.ranked.minrank = 37; // "8d"
      config.unranked.minrank = 37; // "8d"

      const result = conn.checkChallengeUser(notification, "unranked");

      assert.deepEqual(result, ({ reject: false }));

    });

    it ('accept min rank high enough (pro) for all games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 38; // "2p/9d"
      notification.user.professional = true;
  
      config.ranked.minrank = 37; // "1p/8d"
      config.unranked.minrank = 37; // "1p/8d"

      const result = conn.checkChallengeUser(notification, "ranked");

      assert.deepEqual(result, ({ reject: false }));

    });

    it ('accept min rank high enough (pro) for all games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 38; // "2p/9d"
      notification.user.professional = true;
  
      config.ranked.minrank = 37; // "1p/8d"
      config.unranked.minrank = 37; // "1p/8d"

      const result = conn.checkChallengeUser(notification, "unranked");

      assert.deepEqual(result, ({ reject: false }));

    });

    // for ranked unranked specific args, do not exhaustively retest everything,
    // just making sure the ranked unranked args are specifically tested

    it ('reject min rank too low for ranked games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 5; // "25k"

      config.ranked.minrank = 32; // "3d"

      const result = conn.checkChallengeUser(notification, "ranked");

      assert.deepEqual(result, ({ reject: true, reason: 'Minimum rank for ranked games is 3d.\nYou cannot change the ranked setting, but the same setting in an unranked game will be accepted.' }));

    });

    it ('reject min rank too low for unranked games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 5; // "25k"

      config.unranked.minrank = 30; // "1d"

      const result = conn.checkChallengeUser(notification, "unranked");

      assert.deepEqual(result, ({ reject: true, reason: 'Minimum rank for unranked games is 1d.\nYou cannot change the unranked setting, but the same setting in an ranked game will be accepted.' }));

    });

    it ('accept min rank too low for unranked games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 17; // "13k"

      config.ranked.minrank = 10; // "20k"
      config.unranked.minrank = 25; // "5k"

      const result = conn.checkChallengeUser(notification, "ranked");

      assert.deepEqual(result, ({ reject: false }));

    });

    it ('accept min rank too low for ranked games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 17; // "13k"

      config.ranked.minrank = 25; // "5k"
      config.unranked.minrank = 10; // "20k"

      const result = conn.checkChallengeUser(notification, "unranked");

      assert.deepEqual(result, ({ reject: false }));

    });
  });

  describe('Max Rank', () => {

    it ('reject max rank too high (0) for all games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 0; // "30k"
    
      config.ranked.maxrank = -1; // "31k"
      config.unranked.maxrank = -1; // "31k"
    
      const result = conn.checkChallengeUser(notification, "ranked");
    
      assert.deepEqual(result, ({ reject: true, reason: 'Maximum rank is 31k.' }));
    
    });
    
    it ('reject max rank too high (0) for all games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 0; // "30k"
    
      config.ranked.maxrank = -1; // "31k"
      config.unranked.maxrank = -1; // "31k"
    
      const result = conn.checkChallengeUser(notification, "unranked");
    
      assert.deepEqual(result, ({ reject: true, reason: 'Maximum rank is 31k.' }));
    
    });
    
    it ('reject max rank too high for all games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 31; // "2d"
    
      config.ranked.maxrank = 30; // "1d" or "0k"
      config.unranked.maxrank = 30; // "1d" or "0k"
    
      const result = conn.checkChallengeUser(notification, "ranked");
    
      assert.deepEqual(result, ({ reject: true, reason: 'Maximum rank is 1d.' }));
    
    });
    
    it ('reject max rank too high for all games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 31; // "2d"
    
      config.ranked.maxrank = 30; // 1d" or "0k"
      config.unranked.maxrank = 30; // "1d" or "0k"
    
      const result = conn.checkChallengeUser(notification, "unranked");
    
      assert.deepEqual(result, ({ reject: true, reason: 'Maximum rank is 1d.' }));
    
    });
    
    it ('reject max rank too high (8d+) for all games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 39; // "10d"
      notification.user.professional = false;
    
      config.ranked.maxrank = 38; // "9d"
      config.unranked.maxrank = 38; // "9d"
    
      const result = conn.checkChallengeUser(notification, "ranked");
    
      assert.deepEqual(result, ({ reject: true, reason: 'Maximum rank is 9d.' }));
    
    });
    
    it ('reject max rank too high (8d+) for all games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 39; // "10d"
      notification.user.professional = false;
    
      config.ranked.maxrank = 38; // "9d"
      config.unranked.maxrank = 38; // "9d"
    
      const result = conn.checkChallengeUser(notification, "unranked");
    
      assert.deepEqual(result, ({ reject: true, reason: 'Maximum rank is 9d.' }));
    
    });
    
    it ('reject max rank too high (pro) for all games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 37; // "1p"
      notification.user.professional = true;
    
      config.ranked.maxrank = 35; // "-1p/6d"
      config.unranked.maxrank = 35; // "-1p/6d"
    
      const result = conn.checkChallengeUser(notification, "ranked");
    
      assert.deepEqual(result, ({ reject: true, reason: 'Maximum rank is -1p=6d.' }));
    
    });
    
    it ('reject max rank too high (pro) for all games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 37; // "1p"
      notification.user.professional = true;
    
      config.ranked.maxrank = 35; // "-1p/6d"
      config.unranked.maxrank = 35; // "-1p/6d"
    
      const result = conn.checkChallengeUser(notification, "unranked");
    
      assert.deepEqual(result, ({ reject: true, reason: 'Maximum rank is -1p=6d.' }));
    
    });
    
    it ('accept max rank edge max for all games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 17; // "13k"
    
      config.ranked.maxrank = 17; // "13k"
      config.unranked.maxrank = 17; // "13k"
    
      const result = conn.checkChallengeUser(notification, "ranked");
    
      assert.deepEqual(result, ({ reject: false }));
    
    });
    
    it ('accept max rank edge max for all games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 17; // "13k"
    
      config.ranked.maxrank = 17; // "13k"
      config.unranked.maxrank = 17; // "13k"
    
      const result = conn.checkChallengeUser(notification, "unranked");
    
      assert.deepEqual(result, ({ reject: false }));
    
    });
    
    it ('accept max rank low enough for all games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 19; // "11k"
    
      config.ranked.maxrank = 20; // "10k"
      config.unranked.maxrank = 20; // "10k"
    
      const result = conn.checkChallengeUser(notification, "ranked");
    
      assert.deepEqual(result, ({ reject: false }));
    
    });
    
    it ('accept max rank low enough for all games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 19; // "11k"
    
      config.ranked.maxrank = 20; // "10k"
      config.unranked.maxrank = 20; // "10k"
    
      const result = conn.checkChallengeUser(notification, "unranked");
    
      assert.deepEqual(result, ({ reject: false }));
    
    });
    
    it ('accept max rank low enough (8d+) for all games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 36; // "7d"
      notification.user.professional = false;
    
      config.ranked.maxrank = 37; // 8d"
      config.unranked.maxrank = 37; // "8d"
    
      const result = conn.checkChallengeUser(notification, "ranked");
    
      assert.deepEqual(result, ({ reject: false }));
    
    });
    
    it ('accept max rank low enough (8d+) for all games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 36; // "7d"
      notification.user.professional = false;
    
      config.ranked.maxrank = 37; // "8d"
      config.unranked.maxrank = 37; // "8d"
    
      const result = conn.checkChallengeUser(notification, "unranked");
    
      assert.deepEqual(result, ({ reject: false }));
    
    });
    
    it ('accept max rank low enough (pro) for all games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 37; // "1p/8d"
      notification.user.professional = true;
    
      config.ranked.maxrank = 38; // "2p/9d"
      config.unranked.maxrank = 38; // "2p/9d"
    
      const result = conn.checkChallengeUser(notification, "ranked");
    
      assert.deepEqual(result, ({ reject: false }));
    
    });
    
    it ('accept max rank low enough (pro) for all games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 37; // "1p/8d"
      notification.user.professional = true;
    
      config.ranked.maxrank = 38; // "2p/9d"
      config.unranked.maxrank = 38; // "2p/9d"
    
      const result = conn.checkChallengeUser(notification, "unranked");
    
      assert.deepEqual(result, ({ reject: false }));
    
    });
    
    // for ranked unranked specific args, do not exhaustively retest everything,
    // just making sure the ranked unranked args are specifically tested
    
    it ('reject max rank too high for ranked games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 30; // "1d"
    
      config.ranked.maxrank = 25; // "5k"
    
      const result = conn.checkChallengeUser(notification, "ranked");
    
      assert.deepEqual(result, ({ reject: true, reason: 'Maximum rank for ranked games is 5k.\nYou cannot change the ranked setting, but the same setting in an unranked game will be accepted.' }));
    
    });
    
    it ('reject max rank too high for unranked games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 30; // "1d"
    
      config.unranked.maxrank = 25; // "5k"
    
      const result = conn.checkChallengeUser(notification, "unranked");
    
      assert.deepEqual(result, ({ reject: true, reason: 'Maximum rank for unranked games is 5k.\nYou cannot change the unranked setting, but the same setting in an ranked game will be accepted.' }));
    
    });
    
    it ('accept max rank too high for unranked games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 17; // "13k"
    
      config.ranked.maxrank = 25; // "5k"
      config.unranked.maxrank = 10; // "20k"
    
      const result = conn.checkChallengeUser(notification, "ranked");
    
      assert.deepEqual(result, ({ reject: false }));
    
    });
    
    it ('accept max rank too high for ranked games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 17; // "13k"
    
      config.ranked.maxrank = 10; // "20k"
      config.unranked.maxrank = 25; // "5k"
    
      const result = conn.checkChallengeUser(notification, "unranked");
    
      assert.deepEqual(result, ({ reject: false }));
    
    });

  });

  describe('Non r_u Booleans', () => {

    it ('reject pausing on weekends for all games and game is ranked', () => {
      const notification = base_challenge({ ranked: true, time_control: { pause_on_weekends: true } });

      config.ranked.nopauseonweekends = true;
      config.unranked.nopauseonweekends = true;

      const result = conn.checkChallengeBooleans(notification, "ranked");

      assert.deepEqual(result, ({ reject: true, reason: 'Pause on week-ends is not allowed on this bot.' }));

    });

    it ('reject pausing on weekends for all games and game is unranked', () => {
      const notification = base_challenge({ ranked: false, time_control: { pause_on_weekends: true } });

      config.ranked.nopauseonweekends = true;
      config.unranked.nopauseonweekends = true;

      const result = conn.checkChallengeBooleans(notification, "unranked");

      assert.deepEqual(result, ({ reject: true, reason: 'Pause on week-ends is not allowed on this bot.' }));

    });

    it ('accept pausing on weekends for all games and game is ranked', () => {
      const notification = base_challenge({ ranked: true, time_control: { pause_on_weekends: true } });

      config.ranked.nopauseonweekends = undefined;
      config.unranked.nopauseonweekends = undefined;

      const result = conn.checkChallengeBooleans(notification, "ranked");

      assert.deepEqual(result, ({ reject: false }));

    });

    it ('accept pausing on weekends for all games and game is unranked', () => {
      const notification = base_challenge({ ranked: false, time_control: { pause_on_weekends: true } });

      config.ranked.nopauseonweekends = undefined;
      config.unranked.nopauseonweekends = undefined;

      const result = conn.checkChallengeBooleans(notification, "unranked");

      assert.deepEqual(result, ({ reject: false }));

    });

    it ('reject pausing on weekends for ranked games and game is ranked', () => {
      const notification = base_challenge({ ranked: true, time_control: { pause_on_weekends: true } });

      config.ranked.nopauseonweekends = true;

      const result = conn.checkChallengeBooleans(notification, "ranked");

      assert.deepEqual(result, ({ reject: true, reason: 'Pause on week-ends is not allowed on this bot for ranked games.\nYou cannot change the ranked setting, but the same setting in an unranked game will be accepted.' }));

    });

    it ('reject pausing on weekends for unranked games and game is unranked', () => {
      const notification = base_challenge({ ranked: false, time_control: { pause_on_weekends: true } });

      config.unranked.nopauseonweekends = true;

      const result = conn.checkChallengeBooleans(notification, "unranked");

      assert.deepEqual(result, ({ reject: true, reason: 'Pause on week-ends is not allowed on this bot for unranked games.\nYou cannot change the unranked setting, but the same setting in an ranked game will be accepted.' }));

    });

    it ('accept pausing on weekends for ranked games and game is ranked', () => {
      const notification = base_challenge({ ranked: true, time_control: { pause_on_weekends: true } });

      config.ranked.nopauseonweekends = undefined;

      const result = conn.checkChallengeBooleans(notification, "ranked");

      assert.deepEqual(result, ({ reject: false }));

    });

    it ('accept pausing on weekends for unranked games and game is unranked', () => {
      const notification = base_challenge({ ranked: false, time_control: { pause_on_weekends: true } });

      config.unranked.nopauseonweekends = undefined;

      const result = conn.checkChallengeBooleans(notification, "unranked");

      assert.deepEqual(result, ({ reject: false }));

    });

  });

  describe('r_u Booleans (those which are not in another specific test)', () => {

    // ex: user is professional, noautohandicap, and some other r_u booleans are
    // in their respectives tests, not here

    it('reject ranked games if unrankedonly', () => {

      const notification = base_challenge({ ranked: true });

      config.unrankedonly = true;

      const result = conn.checkChallengeBooleans(notification);

      assert.deepEqual(result, ({ reject: true, msg: 'Ranked games are not allowed on this bot.' }));

    });

    it('reject unranked games if rankedonly', () => {

      const notification = base_challenge({ ranked: false });

      config.rankedonly = true;

      const result = conn.checkChallengeBooleans(notification);

      assert.deepEqual(result, ({ reject: true, msg: 'Unranked games are not allowed on this bot.' }));

    });

    it('accept ranked games if rankedonly', () => {

      const notification = base_challenge({ ranked: true });

      config.rankedonly = true;

      const result = conn.checkChallengeBooleans(notification);

      assert.deepEqual(result, ({ reject: false }));

    });

    it('accept unranked games if unrankedonly', () => {

      const notification = base_challenge({ ranked: false });

      config.unrankedonly = true;

      const result = conn.checkChallengeBooleans(notification);

      assert.deepEqual(result, ({ reject: false }));

    });

  });


  describe('Non-square boardsizes', () => {
    it('reject non-square boardsizes if not boardsizes "all"', () => {

      const notification = base_challenge({ ranked: false, width: 19, height: 18 });

      config.boardsizes = "9,13,18,19";

      const result = conn.checkChallengeAllowedGroup(notification);

      assert.deepEqual(result, ({ reject: true, msg: 'Board size 19x18 is not square, not allowed.\nPlease choose a SQUARE board size (same width and height), for example try 9x9 or 19x19.' }));

    });

    it('accept non-square boardsizes if boardsizes "all"', () => {

      const notification = base_challenge({ ranked: false, width: 19, height: 18 });

      config.boardsizes = "all";
      config.allow_all_boardsizes = true;
      config.allowed_boardsizes = [];


      const result = conn.checkChallengeAllowedGroup(notification);

      assert.deepEqual(result, ({ reject: false }));

    });

    it('accept non-square boardsizes if no arg is specified', () => {

      const notification = base_challenge({ ranked: false, width: 19, height: 18 });

      config.allow_all_boardsizes = false;
      config.allowed_boardsizes = [];

      const result = conn.checkChallengeAllowedGroup(notification);

      assert.deepEqual(result, ({ reject: false }));

    });

  });

  describe('Allowed Boardsizes', () => {
    it('reject boardsize not in allowed boardsizes', () => {

      const notification = base_challenge({ ranked: false, width: 18, height: 18 });

      config.boardsizes = "9,13,19";
      config.allow_all_boardsizes = false;
      config.allowed_boardsizes = [];
      config.allowed_boardsizes[9] = true;
      config.allowed_boardsizes[13] = true;
      config.allowed_boardsizes[19] = true;

      const result = conn.checkChallengeAllowedGroup(notification);

      assert.deepEqual(result, ({ reject: true, msg: 'Board size 18x18 is not allowed on this bot, please choose one of these allowed Board sizes:\n9x9, 13x13, 19x19.' }));

    });

    it('accept boardsize in allowed boardsizes', () => {

      const notification = base_challenge({ ranked: false, width: 19, height: 19 });

      config.boardsizes = "9,13,19";
      config.allow_all_boardsizes = false;
      config.allowed_boardsizes = [];
      config.allowed_boardsizes[9] = true;
      config.allowed_boardsizes[13] = true;
      config.allowed_boardsizes[19] = true;

      const result = conn.checkChallengeAllowedGroup(notification);

      assert.deepEqual(result, ({ reject: false }));

    });

    it('accept boardsize not in allowed boardsizes if all', () => {

      const notification = base_challenge({ ranked: false, width: 18, height: 18 });

      config.boardsizes = "all";
      config.allow_all_boardsizes = true;
      config.allowed_boardsizes = [];

      const result = conn.checkChallengeAllowedGroup(notification);

      assert.deepEqual(result, ({ reject: false }));

    });

  });

  describe('Allowed Speeds', () => {
    it('reject speed not in allowed speeds', () => {

      const notification = base_challenge({ ranked: false, time_control: { speed: "correspondence" } });

      config.speeds = "blitz, live";
      config.allow_all_speeds = false;
      config.allowed_speeds = [];
      config.allowed_speeds["blitz"] = true;
      config.allowed_speeds["live"] = true;

      const result = conn.checkChallengeAllowedGroup(notification);

      assert.deepEqual(result, ({ reject: true, msg: 'Speed correspondence is not allowed on this bot, please choose one of these allowed Speeds:\nblitz, live.' }));

    });

    it('accept speed in allowed speeds', () => {

      const notification = base_challenge({ ranked: false, time_control: { speed: "live" } });

      config.speeds = "blitz, live";
      config.allow_all_speeds = false;
      config.allowed_speeds = [];
      config.allowed_speeds["blitz"] = true;
      config.allowed_speeds["live"] = true;

      const result = conn.checkChallengeAllowedGroup(notification);

      assert.deepEqual(result, ({ reject: false }));

    });

    it('accept speed not in allowed speeds if all', () => {

      const notification = base_challenge({ ranked: false, time_control: { speed: "correspondence" } });

      config.speeds = "all";
      config.allow_all_speeds = true;
      config.allowed_speeds = [];

      const result = conn.checkChallengeAllowedGroup(notification);

      assert.deepEqual(result, ({ reject: false }));

    });

  });

  describe('Allowed Group General Ranked Unranked precedence rules', () => {

    // We already tested extensively how the allowed groups options work, so now we just want to
    // make sure the general / ranked / unranked priority order is respected.
    // speeds is a good and simple example

    it('reject speed based on ranked arg if ranked arg is used and game is ranked', () => {

      const notification = base_challenge({ ranked: true, time_control: { speed: "live" } });

      config.speedsranked = "blitz,correspondence";
      config.allow_all_speeds_ranked = false;
      config.allowed_speeds_ranked = [];
      config.allowed_speeds_ranked["blitz"] = true;
      config.allowed_speeds_ranked["correspondence"] = true;
      config.speedsunranked = "live";
      config.allow_all_speeds_unranked = false;
      config.allowed_speeds_unranked = [];

      const result = conn.checkChallengeAllowedGroup(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'Speed live is not allowed on this bot for ranked games, please choose one of these allowed Speeds for ranked games:\nblitz,correspondence.' }));

    });

    it('accept speed based on ranked arg if ranked arg is used and game is ranked', () => {

      const notification = base_challenge({ ranked: true, time_control: { speed: "blitz" } });

      config.speedsranked = "blitz,correspondence";
      config.allow_all_speeds_ranked = false;
      config.allowed_speeds_ranked = [];
      config.allowed_speeds_ranked["blitz"] = true;
      config.allowed_speeds_ranked["correspondence"] = true;
      config.speedsunranked = "live";
      config.allow_all_speeds_unranked = false;
      config.allowed_speeds_unranked = [];
      config.allowed_speeds_unranked["live"] = true;

      const result = conn.checkChallengeAllowedGroup(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('reject speed based on unranked arg if unranked arg is used and game is unranked', () => {

      const notification = base_challenge({ ranked: false, time_control: { speed: "blitz" } });

      config.speedsranked = "blitz,correspondence";
      config.allow_all_speeds_ranked = false;
      config.allowed_speeds_ranked = [];
      config.allowed_speeds_ranked["blitz"] = true;
      config.allowed_speeds_ranked["correspondence"] = true;
      config.speedsunranked = "live";
      config.allow_all_speeds_unranked = false;
      config.allowed_speeds_unranked = [];
      config.allowed_speeds_unranked["live"] = true;

      const result = conn.checkChallengeAllowedGroup(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'Speed blitz is not allowed on this bot for unranked games, please choose one of these allowed Speeds for unranked games:\nlive.' }));

    });

    it('accept speed based on unranked arg if unranked arg is used and game is unranked', () => {

      const notification = base_challenge({ ranked: false, time_control: { speed: "live" } });

      config.speedsranked = "blitz,correspondence";
      config.allow_all_speeds_ranked = false;
      config.allowed_speeds_ranked = [];
      config.allowed_speeds_ranked["blitz"] = true;
      config.allowed_speeds_ranked["correspondence"] = true;
      config.speedsunranked = "live";
      config.allow_all_speeds_unranked = false;
      config.allowed_speeds_unranked = [];
      config.allowed_speeds_unranked["live"] = true;

      const result = conn.checkChallengeAllowedGroup(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

  });

  describe('Handicap', () => {

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

    it('reject handicap too high (no handicap games) ', () => {

      const notification = base_challenge({ ranked: false, handicap: 1 });

      config.noautohandicap = true;
      config.minhandicap = 0;
      config.maxhandicap = 0;
      
      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum number of handicap stones is 0, please reduce the number of handicap stones (no handicap games).' }));

    });

    it('reject handicap too high ', () => {

      const notification = base_challenge({ ranked: false, handicap: 9 });

      config.noautohandicap = true;
      config.minhandicap = 0;
      config.maxhandicap = 6;
      
      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum number of handicap stones is 6, please reduce the number of handicap stones.' }));

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
      
      assert.deepEqual(result, ({ reject: true, msg: 'Minimum Main Time for blitz games in byoyomi is 10 seconds, please increase Main Time.' }));
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
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum Main Time for blitz games in byoyomi is 30 seconds, please reduce Main Time.' }));
    });

    // Periods Blitz

    it('reject number of periods blitz too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 1, period_time: 1 } });

      config.minperiodsblitz = 3;
      config.maxperiodsblitz = 20;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'Minimum number of periods for blitz games in byoyomi is 3, please increase the number of periods.' }));
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
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum number of periods for blitz games in byoyomi is 20, please reduce the number of periods.' }));
    });

    // Period Time Blitz

    it('reject period time blitz too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "blitz", main_time: 1, periods: 1, period_time: 1 } });

      config.minperiodtimeblitz = 5;
      config.maxperiodtimeblitz = 15;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: `Minimum Period Time for blitz games in byoyomi is 5 seconds, please increase Period Time.` }));
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
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum Period Time for blitz games in byoyomi is 15 seconds, please reduce Period Time.' }));
    });

    // Main Time Live

    it('reject main time live too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 1, period_time: 1 } });
  
      config.minmaintimelive = 60;
      config.maxmaintimelive = 300;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'Minimum Main Time for live games in byoyomi is 1 minutes, please increase Main Time.' }));
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
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum Main Time for live games in byoyomi is 5 minutes, please reduce Main Time.' }));
    });
  
    // Periods Live
  
    it('reject number of periods live too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 1, period_time: 1 } });
  
      config.minperiodslive = 3;
      config.maxperiodslive = 20;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'Minimum number of periods for live games in byoyomi is 3, please increase the number of periods.' }));
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
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum number of periods for live games in byoyomi is 20, please reduce the number of periods.' }));
    });
  
    // Period Time Live
  
    it('reject period time live too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "live", main_time: 1, periods: 1, period_time: 1 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 120;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: `Minimum Period Time for live games in byoyomi is 10 seconds, please increase Period Time.` }));
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
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum Period Time for live games in byoyomi is 2 minutes, please reduce Period Time.' }));
    });

    // Main Time Correspondence

    it('reject main time correspondence too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 1, period_time: 1 } });

      config.minmaintimecorr = 259200;
      config.maxmaintimecorr = 604800;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'Minimum Main Time for correspondence games in byoyomi is 3 days, please increase Main Time.' }));
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
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum Main Time for correspondence games in byoyomi is 7 days, please reduce Main Time.' }));
    });

    // Periods Correspondence

    it('reject number of periods correspondence too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 1, period_time: 1 } });

      config.minperiodscorr = 3;
      config.maxperiodscorr = 10;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'Minimum number of periods for correspondence games in byoyomi is 3, please increase the number of periods.' }));
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
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum number of periods for correspondence games in byoyomi is 10, please reduce the number of periods.' }));
    });

    // Period Time Correspondence

    it('reject period time correspondence too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "byoyomi", time_control: "byoyomi", speed: "correspondence", main_time: 1, periods: 1, period_time: 1 } });

      config.minperiodtimecorr = 14400;
      config.maxperiodtimecorr = 259200;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: `Minimum Period Time for correspondence games in byoyomi is 4 hours, please increase Period Time.` }));
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
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum Period Time for correspondence games in byoyomi is 3 days, please reduce Period Time.' }));
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

      config.minmaintimecorr = 20000;
      config.maxmaintimecorr = 80000;
      config.minperiodscorr = 3;
      config.maxmaintimecorr = 10;
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
      
      assert.deepEqual(result, ({ reject: true, msg: 'Minimum Main Time for live games in canadian is 1 minutes, please increase Main Time.' }));
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
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum Main Time for live games in canadian is 30 minutes, please reduce Main Time.' }));
    });

    // Periods are not checked for non-byoyomi time controls

    // Period Time (Period Time for all the X Stones)

    it('reject period time for all the stones live too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 5, main_time: 1, period_time: 74 } });

      config.minperiodtimelive = 15;  // 15 seconds per stone * 5 stones = 75 = 1 minutes 15 seconds for all the 5 stones
      config.maxperiodtimelive = 300; // 5  minutes per stone * 5 stones = 1500 = 25 minutes for all the 5 stones
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'Minimum Period Time for all the 5 stones for live games in canadian is 1 minutes 15 seconds, please increase Period Time for all the 5 stones, or change the number of stones per period.' }));
    });

    it('accept period time for all the stones live edge min', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 5, main_time: 1, period_time: 75 } });

      config.minperiodtimelive = 15;  // 15 seconds per stone * 5 stones = 75 = 1 minutes 15 seconds for all the 5 stones
      config.maxperiodtimelive = 300; // 5  minutes per stone * 5 stones = 1500 = 25 minutes for all the 5 stones
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });

    it('accept period time for all the stones live between min and max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 5, main_time: 1, period_time: 120 } });

      config.minperiodtimelive = 15;  // 15 seconds per stone * 5 stones = 75 = 1 minutes 15 seconds for all the 5 stones
      config.maxperiodtimelive = 300; // 5  minutes per stone * 5 stones = 1500 = 25 minutes for all the 5 stones
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });

    it('accept period time for all the stones live edge max', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 5, main_time: 1, period_time: 1500 } });

      config.minperiodtimelive = 15;  // 15 seconds per stone * 5 stones = 75 = 1 minutes 15 seconds for all the 5 stones
      config.maxperiodtimelive = 300; // 5  minutes per stone * 5 stones = 1500 = 25 minutes for all the 5 stones
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, { reject: false });
    });

    it('reject period time for all the stones live too high', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "canadian", time_control: "canadian", speed: "live", stones_per_period: 5, main_time: 1, period_time: 1501 } });

      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 300;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum Period Time for all the 5 stones for live games in canadian is 25 minutes, please reduce Period Time for all the 5 stones, or change the number of stones per period.' }));
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
      
      assert.deepEqual(result, ({ reject: true, msg: 'Minimum Initial Time for live games in fischer is 1 minutes, please increase Initial Time.' }));
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
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum Initial Time for live games in fischer is 30 minutes, please reduce Initial Time.' }));
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
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum Max Time for live games in fischer is 30 minutes, please reduce Max Time.' }));
    });

    // Periods are not checked for non-byoyomi time controls

    // Period Time (Increment Time)

    it('reject period time (increment time) too low', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "fischer", time_control: "fischer", speed: "live", time_increment: 9, initial_time: 1, max_time: 1 } });
  
      config.minperiodtimelive = 10;
      config.maxperiodtimelive = 130;
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'Minimum Increment Time for live games in fischer is 10 seconds, please increase Increment Time.' }));
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
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum Increment Time for live games in fischer is 2 minutes 10 seconds, please reduce Increment Time.' }));
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
      
      assert.deepEqual(result, ({ reject: true, msg: 'Minimum Time per move for live games in simple is 10 seconds, please increase Time per move.' }));
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
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum Time per move for live games in simple is 2 minutes 10 seconds, please reduce Time per move.' }));
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
      
      assert.deepEqual(result, ({ reject: true, msg: 'Minimum Total Time for live games in absolute is 5 minutes 52 seconds, please increase Total Time.' }));
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
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum Total Time for live games in absolute is 1 hours 8 minutes 47 seconds, please reduce Total Time.' }));
    });

    // Periods are not checked for non-byoyomi time controls

    // Period Time is not checked for absolute time control

  });

  describe('Min Max General Ranked Unranked precedence rules', () => {

    // We already tested extensively how the min max args work, so now we just want to
    // make sure the general / ranked / unranked priority order is respected.
    // MinMax handicap is a good and simple example

    it('reject handicap based on ranked arg if ranked arg is used and game is ranked', () => {

      const notification = base_challenge({ ranked: true, handicap: 8 });

      config.noautohandicapranked = true;
      config.noautohandicapunranked = true;
      config.minhandicapranked = 4;
      config.maxhandicapranked = 6;
      config.minhandicapunranked = 8;
      config.maxhandicapunranked = 10;

      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum number of handicap stones for ranked games is 6, please reduce the number of handicap stones.\nYou may try unranked.' }));

    });

    it('accept handicap based on ranked arg if ranked arg is used and game is ranked', () => {

      const notification = base_challenge({ ranked: true, handicap: 5 });

      config.noautohandicapranked = true;
      config.noautohandicapunranked = true;
      config.minhandicapranked = 4;
      config.maxhandicapranked = 6;
      config.minhandicapunranked = 8;
      config.maxhandicapunranked = 10;

      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('reject handicap based on unranked arg if unranked arg is used and game is unranked', () => {

      const notification = base_challenge({ ranked: false, handicap: 7 });

      config.noautohandicapranked = true;
      config.noautohandicapunranked = true;
      config.minhandicapranked = 4;
      config.maxhandicapranked = 6;
      config.minhandicapunranked = 8;
      config.maxhandicapunranked = 10;

      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'Minimum number of handicap stones for unranked games is 8, please increase the number of handicap stones.\nYou may try ranked.' }));

    });

    it('accept handicap based on unranked arg if unranked arg is used and game is unranked', () => {

      const notification = base_challenge({ ranked: false, handicap: 9 });

      config.noautohandicapranked = true;
      config.noautohandicapunranked = true;
      config.minhandicapranked = 4;
      config.maxhandicapranked = 6;
      config.minhandicapunranked = 8;
      config.maxhandicapunranked = 10;

      const result = conn.checkChallengeHandicap(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

  });

});
