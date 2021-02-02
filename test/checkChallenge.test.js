// vim: tw=120 softtabstop=4 shiftwidth=4

const assert = require('assert');
const fs = require('fs');
const https = require('https');
const sinon = require('sinon');

const { assignConfigArguments } = require('./module_loading/assignConfigArguments');
const { base_challenge } = require('./base_server_packets/base_challenge');
const { disableAllOtherTimeSettingsOptions } = require('./module_loading/disableAllOtherTimeSettingsOptions');
const { FakeAPI } = require('./fake_modules/FakeAPI');
const { FakeSocket } = require('./fake_modules/FakeSocket');
const { getNewConfigUncached } = require('./module_loading/getNewConfigUncached');
const { getNewConnectionUncached } = require('./module_loading/getNewConnectionUncached');
const { stub_console } = require('./utils/stub_console');

let config;
let connection;

afterEach(function () {
    sinon.restore();
});

describe('Challenges', () => {
  
  let conn;
 
  beforeEach(function() {
    stub_console();

    config = getNewConfigUncached();
    assignConfigArguments(config);
    connection = getNewConnectionUncached();

    sinon.useFakeTimers();
    
    const fake_api = new FakeAPI();
    fake_api.request({path: '/foo'}, () => {});
    sinon.stub(https, 'request').callsFake(fake_api.request);
    
    const fake_socket = new FakeSocket();
    conn = new connection.Connection(() => { return fake_socket; }, config);
  });
  
  describe('Defaults', () => {

    it('accept default notification from base_challenge with all defaults from config', () => {
      const notification = base_challenge();
      
      const result = conn.checkChallenge(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

  });

  describe('Sanity Checks', () => {

    it('accept real notification challenge with almost empty config (except defaults from base_challenge)', () => {
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
      
      const result = conn.checkChallenge(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

    it('reject empty notification challenge', () => {
    const notification = {};
    
    const result = conn.checkChallenge(notification);
    
    assert.deepEqual(result, ({ reject: true, msg: 'Missing key user, cannot check challenge, please try again.' }));
    });

    it('reject non-correspondence challenge that has pause on weekends', () => {
      const notification = base_challenge({ time_control: { system: "fischer", time_control: "fischer", speed: "live", pause_on_weekends: true, time_increment: 1, initial_time: 59, max_time: 59 } });

      const result = conn.checkChallengeSanityChecks(notification);

      assert.deepEqual(result, ({ reject: true, msg: 'There was an unexpected error: your live challenge has pause on weekends, but this is only possible for correspondence games, please try again.' }));
    });

    it('accept non-correspondence challenge that does not have pause on weekends', () => {
      const notification = base_challenge({ time_control: { system: "fischer", time_control: "fischer", speed: "live", pause_on_weekends: false, time_increment: 1, initial_time: 59, max_time: 59 } });

      const result = conn.checkChallengeSanityChecks(notification);

      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept correspondence challenge that has pause on weekends', () => {
      const notification = base_challenge({ time_control: { system: "fischer", time_control: "fischer", speed: "correspondence", pause_on_weekends: true, time_increment: 1, initial_time: 59, max_time: 59 } });

      const result = conn.checkChallengeSanityChecks(notification);

      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept correspondence challenge that does not have pause on weekends', () => {
      const notification = base_challenge({ time_control: { system: "fischer", time_control: "fischer", speed: "correspondence", pause_on_weekends: false, time_increment: 1, initial_time: 59, max_time: 59 } });

      const result = conn.checkChallengeSanityChecks(notification);

      assert.deepEqual(result, ({ reject: false }));
    });

  });

  describe('Bans', () => {
    it('should reject banned users', () => {
      const notification = base_challenge({ user: { username: 'bannedName', id: 5 } });

      config.banned_users[notification.user.username] = true;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'You (bannedName) are not allowed to play games against this bot.' }));
    });
    
    it('should reject banned users by id', () => {
      const notification = base_challenge({ user: { username: 'bannedName', id: 5 } });

      config.banned_users[notification.user.id] = true;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'You (bannedName) are not allowed to play games against this bot.' }));
    });
      
    it('should reject banned ranked users', () => {
      const notification = base_challenge({ ranked: true, user: { username: 'bannedRankedName', id: 6 } });

      config.banned_users_ranked[notification.user.username] = true;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'You (bannedRankedName) are not allowed to play ranked games against this bot.' }));
    });
      
    it('should reject banned ranked users by id', () => {
      const notification = base_challenge({ ranked: true, user: { username: 'bannedRankedName', id: 6 } });

      config.banned_users_ranked[notification.user.id] = true;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'You (bannedRankedName) are not allowed to play ranked games against this bot.' }));
    });
    
    it('should reject banned unranked users', () => {
      const notification = base_challenge({ ranked: false, user: { username: 'bannedUnrankedName', id: 7 } });

      config.banned_users_unranked[notification.user.username] = true;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'You (bannedUnrankedName) are not allowed to play unranked games against this bot.' }));
    });
    
    it('should reject banned unranked users by id', () => {
      const notification = base_challenge({ ranked: false, user: { username: 'bannedUnrankedName', id: 7 } });

      config.banned_users_unranked[notification.user.id] = true;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'You (bannedUnrankedName) are not allowed to play unranked games against this bot.' }));
    });

  });

  describe('No provisional', () => {
    it('reject provisional player for all games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ui_class = "provisional"

      config.noprovisional = true;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'It seems you are still new on OGS (Provisional Player), this bot only accepts challenges from players with a regular ranking, you need to play a few more ranked games.' }));
    });

    it('reject provisional player for all games and game is unranked', () => {
        const notification = base_challenge({ ranked: false });
        // cannot override user directly: it would delete other required properties in notification.user
        notification.user.ui_class = "provisional"
  
        config.noprovisional = true;
        
        const result = conn.checkChallengeUser(notification);
        
        assert.deepEqual(result, ({ reject: true, msg: 'It seems you are still new on OGS (Provisional Player), this bot only accepts challenges from players with a regular ranking, you need to play a few more ranked games.' }));
      });

    it('reject provisional player for all games even with other ui_classes', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ui_class = "supporter provisional timeout admin"
  
      config.noprovisional = true;
        
      const result = conn.checkChallengeUser(notification);
        
      assert.deepEqual(result, ({ reject: true, msg: 'It seems you are still new on OGS (Provisional Player), this bot only accepts challenges from players with a regular ranking, you need to play a few more ranked games.' }));
    });

    it('accept non-provisional player for all games (empty ui_class) and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ui_class = ""
  
      config.noprovisional = true;
        
      const result = conn.checkChallengeUser(notification);
        
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept non-provisional player for all games (empty ui_class) and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ui_class = ""
    
      config.noprovisional = true;
          
      const result = conn.checkChallengeUser(notification);
          
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept non-provisional player (with other ui_classes)', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ui_class = "supporter timeout admin"
    
      config.noprovisional = true;
        
      const result = conn.checkChallengeUser(notification);
         
      assert.deepEqual(result, ({ reject: false }));
    });

    // minimal ranked unranked args testing, already covered cases for general arg, and already tested getCheckedArgName
    // in other tests

    it('reject provisional player for ranked games and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ui_class = "provisional"
  
      config.noprovisionalranked = true;
      
      const result = conn.checkChallengeUser(notification);
        
      assert.deepEqual(result, ({ reject: true, msg: 'It seems you are still new on OGS (Provisional Player), this bot only accepts challenges from players with a regular ranking for ranked games, you need to play a few more ranked games.' }));
    });

    it('reject provisional player for unranked games and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ui_class = "provisional"
    
      config.noprovisionalunranked = true;
        
      const result = conn.checkChallengeUser(notification);
          
      assert.deepEqual(result, ({ reject: true, msg: 'It seems you are still new on OGS (Provisional Player), this bot only accepts challenges from players with a regular ranking for unranked games, you need to play a few more ranked games.' }));
    });

    it('accept non-provisional player for ranked games (empty ui_class) and game is ranked', () => {
      const notification = base_challenge({ ranked: true });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ui_class = ""
      
      config.noprovisionalranked = true;
            
      const result = conn.checkChallengeUser(notification);
            
      assert.deepEqual(result, ({ reject: false }));
    });

    it('accept non-provisional player for unranked games (empty ui_class) and game is unranked', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ui_class = ""
      
      config.noprovisionalunranked = true;
            
      const result = conn.checkChallengeUser(notification);
            
      assert.deepEqual(result, ({ reject: false }));
    });

  });

  describe('Min Max Rank', () => {

    it('reject user ranking too low', () => {

      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 10; // "20k"

      config.minrank = 17;
      config.maxrank = 32;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'Minimum rank is 13k.' }));

    });

    it('accept user ranking edge min', () => {

      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 17; // "13k"

      config.minrank = 17;
      config.maxrank = 32;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('accept user ranking between min and max', () => {

      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 25; // "5k"

      config.minrank = 17;
      config.maxrank = 32;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('accept user ranking edge max', () => {
      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 32; // "3d"

      config.minrank = 17;
      config.maxrank = 32;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: false }));

    });

    it('reject user ranking too high', () => {

      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 35; // "6d"

      config.minrank = 17;
      config.maxrank = 32;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum rank is 3d.' }));

    });

    it('reject user ranking too high (9d+)', () => {

      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 41; // "12d"

      config.minrank = 17;
      config.maxrank = 32;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum rank is 3d.' }));

    });

    it('reject user ranking too high (pro)', () => {

      const notification = base_challenge({ ranked: false });
      // cannot override user directly: it would delete other required properties in notification.user
      notification.user.ranking = 37; // "1p" (1p" = "8d")

      config.minrank = 17;
      config.maxrank = 32;
      
      const result = conn.checkChallengeUser(notification);
      
      assert.deepEqual(result, ({ reject: true, msg: 'Maximum rank is 3d.' }));
    });
   
  });

  describe('Rejectnew', () => {

    it('reject all games if rejectnew is used with default rejectnewmsg', () => {

      const notification = base_challenge({ ranked: false });

      config.rejectnew = true;

      const result = conn.checkChallengeBot(notification, fs);
      
      assert.deepEqual(result, ({ reject: true, msg: 'Currently, this bot is not accepting games, try again later' }));
    });

    // rejectnew is ranked-unranked aspecific, so ranked unranked testing is minimal
    it('also rejectnew in ranked games', () => {

        const notification = base_challenge({ ranked: true });
  
        config.rejectnew = true;
        
        const result = conn.checkChallengeBot(notification, fs);
        
        assert.deepEqual(result, ({ reject: true, msg: 'Currently, this bot is not accepting games, try again later' }));
    });

    it('reject all games if rejectnew is used with custom rejectnewmsg', () => {

        const notification = base_challenge({ ranked: false });
  
        config.rejectnew = true;
        config.rejectnewmsg = 'Sorry, i am not available now.';
        
        const result = conn.checkChallengeBot(notification, fs);
        
        assert.deepEqual(result, ({ reject: true, msg: 'Sorry, i am not available now.' }));
    });

    it('do not reject game if rejectnew is not used, and rejectnewmsg is default', () => {

        const notification = base_challenge({ ranked: false });
        
        const result = conn.checkChallengeBot(notification, fs);
        
        assert.deepEqual(result, ({ reject: false }));
    });

    it('also do not reject game in ranked games', () => {

        const notification = base_challenge({ ranked: true });
        
        const result = conn.checkChallengeBot(notification, fs);
        
        assert.deepEqual(result, ({ reject: false }));
    });

    it('do not reject game if rejectnew is not used, and rejectnewmsg is custom', () => {

        const notification = base_challenge({ ranked: false });

        config.rejectnewmsg = 'Sorry, i am not available now.';
        
        const result = conn.checkChallengeBot(notification, fs);
        
        assert.deepEqual(result, ({ reject: false }));
    });

    it('reject all games if rejectnewfile is used and a reject file exists', () => {

        const notification = base_challenge({ ranked: false });
  
        // relative path from where shell is, so root of gtp2ogs
        config.rejectnewfile = "./test/rejectnew/rejectnew-file.txt";
        
        const result = conn.checkChallengeBot(notification, fs);
        
        assert.deepEqual(result, ({ reject: true, msg: 'Currently, this bot is not accepting games, try again later' }));
    });

    it('accept all games if rejectnewfile is used but a reject file does not exist, and rejectnew msg is default', () => {

        const notification = base_challenge({ ranked: false });
  
        // relative path from where shell is, so root of gtp2ogs
        config.rejectnewfile = "./test/rejectnew/rejectnew-file-someotherfilethatdoesnotexist.txt";
        
        const result = conn.checkChallengeBot(notification, fs);
        
        assert.deepEqual(result, ({ reject: false }));
    });

    it('accept all games if rejectnewfile is used but a reject file does not exist, and rejectnew msg is custom', () => {

        const notification = base_challenge({ ranked: false });
  
        // relative path from where shell is, so root of gtp2ogs
        config.rejectnewfile = "./test/rejectnew/rejectnew-file-someotherfilethatdoesnotexist.txt";
        config.rejectnewmsg = 'Sorry, i am not available now.';
        
        const result = conn.checkChallengeBot(notification, fs);
        
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

  });

  describe('Some Booleans', () => {

    // user is professional and noautohandicap are in their respective checkChallenge functions, not here.

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

      // after override of notification.time_control.time_control reassign it
      const notification = base_challenge({ ranked: false, time_control: { speed: "correspondence", time_control: "byoyomi" } });

      config.speeds = "blitz, live";
      config.allow_all_speeds = false;
      config.allowed_speeds = [];
      config.allowed_speeds["blitz"] = true;
      config.allowed_speeds["live"] = true;

      const result = conn.checkChallengeAllowedGroup(notification);

      assert.deepEqual(result, ({ reject: true, msg: 'Speed correspondence is not allowed on this bot, please choose one of these allowed Speeds:\nblitz, live.' }));

    });

    it('accept speed in allowed speeds', () => {

      // after override of notification.time_control.time_control reassign it
      const notification = base_challenge({ ranked: false, time_control: { speed: "live", time_control: "byoyomi" } });

      config.speeds = "blitz, live";
      config.allow_all_speeds = false;
      config.allowed_speeds = [];
      config.allowed_speeds["blitz"] = true;
      config.allowed_speeds["live"] = true;

      const result = conn.checkChallengeAllowedGroup(notification);

      assert.deepEqual(result, ({ reject: false }));

    });

    it('accept speed not in allowed speeds if all', () => {

      // after override of notification.time_control.time_control reassign it
      const notification = base_challenge({ ranked: false, time_control: { speed: "correspondence", time_control: "byoyomi" } });

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

      // after override of notification.time_control.time_control reassign it
      const notification = base_challenge({ ranked: true, time_control: { speed: "live", time_control: "byoyomi" } });

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

      // after override of notification.time_control.time_control reassign it
      const notification = base_challenge({ ranked: true, time_control: { speed: "blitz", time_control: "byoyomi" } });

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

      // after override of notification.time_control.time_control reassign it
      const notification = base_challenge({ ranked: false, time_control: { speed: "blitz", time_control: "byoyomi" } });

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

      // after override of notification.time_control.time_control reassign it
      const notification = base_challenge({ ranked: false, time_control: { speed: "live", time_control: "byoyomi" } });

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

  describe('Byoyomi maintime blitz settings', () => {

    // sample:
    // {"system":"byoyomi","time_control":"byoyomi","speed":"live","pause_on_weekends":false,"main_time":1200,"period_time":30,"periods":5}

    beforeEach(function() {
        disableAllOtherTimeSettingsOptions(config, "maintime", "blitz");
    });

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

  });

  describe('Byoyomi periods blitz settings ', () => {

    beforeEach(function() {
        disableAllOtherTimeSettingsOptions(config, "periods", "blitz");
    });

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

  });

  describe('Byoyomi periodtime blitz settings', () => {

    beforeEach(function() {
        disableAllOtherTimeSettingsOptions(config, "periodtime", "blitz");
    });

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

  });

  describe('Byoyomi maintime live settings', () => {

    beforeEach(function() {
        disableAllOtherTimeSettingsOptions(config, "maintime", "live");
    });

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

  });

  describe('Byoyomi periods live settings', () => {

    beforeEach(function() {
      disableAllOtherTimeSettingsOptions(config, "periods", "live");
    });
  
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

  });

  describe('Byoyomi periodtime live settings', () => {

    beforeEach(function() {
      disableAllOtherTimeSettingsOptions(config, "periodtime", "live");
    });
  
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

  });

  describe('Byoyomi maintime corr settings', () => {

    beforeEach(function() {
      disableAllOtherTimeSettingsOptions(config, "maintime", "corr");
    });

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

  });

  describe('Byoyomi periods corr settings', () => {

    beforeEach(function() {
      disableAllOtherTimeSettingsOptions(config, "periods", "corr");
    });

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

  });

  describe('Byoyomi periodtime corr settings', () => {

    beforeEach(function() {
      disableAllOtherTimeSettingsOptions(config, "periodtime", "corr");
    });

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

    beforeEach(function() {
      disableAllOtherTimeSettingsOptions(config, "maintime", "live");
    });

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

  describe('Non-Byoyomi time controls have no periods, do not check periods', () => {

    beforeEach(function() {
      disableAllOtherTimeSettingsOptions(config, "periods", "live");
    });

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

    beforeEach(function() {
      disableAllOtherTimeSettingsOptions(config, "periodtime", "corr");
    });

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

    it('none time control accepts any period time, even if config is full of defaults', () => {
      const notification = base_challenge({ ranked: false, time_control: { system: "none", time_control: "none", speed: "correspondence" } });
      
      const result = conn.checkChallengeTimeSettings(notification);
      
      assert.deepEqual(result, ({ reject: false }));
    });

  });

  describe('Canadian maintime settings', () => {

    // sample:
    // {"system":"canadian","time_control":"canadian","speed":"live","pause_on_weekends":false,"main_time":600,"period_time":180,"stones_per_period":1}

    // Just making sure it works similarly as byoyomi, so testing only "live" speed.

    beforeEach(function() {
      disableAllOtherTimeSettingsOptions(config, "maintime", "live");
    });

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

  });

  // Periods are not checked for non-byoyomi time controls

  describe('Canadian periodtime settings (for all the X stones)', () => {

    beforeEach(function() {
      disableAllOtherTimeSettingsOptions(config, "periodtime", "live");
    });

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

  describe('Fischer maintime 1 (initial time) settings', () => {

    // sample:
    // {"system":"fischer","time_control":"fischer","speed":"live","pause_on_weekends":false,"time_increment":10,"initial_time":80,"max_time":120}

    // Just making sure it works similarly as byoyomi, so testing only "live" speed.

    beforeEach(function() {
      disableAllOtherTimeSettingsOptions(config, "maintime", "live");
    });

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

  });

  describe('Fischer maintime 2 (max time) settings', () => {

    beforeEach(function() {
      disableAllOtherTimeSettingsOptions(config, "maintime", "live");
    });

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

  });

  // Periods are not checked for non-byoyomi time controls

  describe('Fischer periodtime (increment time) settings', () => {

    beforeEach(function() {
      disableAllOtherTimeSettingsOptions(config, "periodtime", "live");
    });

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

  describe('Simple time (periodtime) settings', () => {

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

  describe('Absolute (maintime) time settings', () => {

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
