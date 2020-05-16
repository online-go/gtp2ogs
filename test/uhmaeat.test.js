// vim: tw=120 softtabstop=4 shiftwidth=4

let assert = require('assert');

let connection = require('../connection');
let config = require('../config');
let console = require('../console').console;

let sinon = require('sinon');

let https = require('https');

let { FakeSocket, FakeAPI, base_challenge } = require('./test')

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

function stub_console() {
    sinon.stub(console, 'log');
    sinon.stub(console, 'debug');
}

afterEach(function () {
    sinon.restore();
});

describe('uhmaeat', () => {
  
  let conn;
 
  beforeEach(function() {
    stub_console();
    sinon.useFakeTimers();
    
    let fake_api = new FakeAPI();
    fake_api.request({path: '/foo'}, () => {});
    sinon.stub(https, 'request').callsFake(fake_api.request);
    
    let fake_socket = new FakeSocket();
    conn = new connection.Connection(() => { return fake_socket; });
  });
  
  it('should reject banned users', () => {
    let notification = base_challenge({ user: { username: 'bannedName', id: 5 } });
    config.banned_users[notification.user.username] = true;
    
    let result = conn.checkChallengeMandatory(notification);
    
    assert.deepEqual(result, ({ reject: true,   msg: 'You (bannedName) are not allowed to play games against this bot.' }));
  })
  
  it('should reject banned users by id', () => {
    let notification = base_challenge({ user: { username: 'bannedName', id: 5 } });
    config.banned_users[notification.user.id] = true;
    
    let result = conn.checkChallengeMandatory(notification);
    
    assert.deepEqual(result, ({ reject: true,   msg: 'You (bannedName) are not allowed to play games against this bot.' }));
  })
    
  it('should reject banned ranked users', () => {
    let notification = base_challenge({ ranked: true, user: { username: 'bannedRankedName', id: 6 } });
    config.banned_users_ranked[notification.user.username] = true;
    
    let result = conn.checkChallengeMandatory(notification);
    
    assert.deepEqual(result, ({ reject: true,   msg: 'You (bannedRankedName) are not allowed to play ranked games against this bot.' }));
  })
    
  it('should reject banned ranked users by id', () => {
    let notification = base_challenge({ ranked: true, user: { username: 'bannedRankedName', id: 6 } });
    config.banned_users_ranked[notification.user.id] = true;
    
    let result = conn.checkChallengeMandatory(notification);
    
    assert.deepEqual(result, ({ reject: true,   msg: 'You (bannedRankedName) are not allowed to play ranked games against this bot.' }));
  })
  
  it('should reject banned unranked users', () => {
    let notification = base_challenge({ ranked: false, user: { username: 'bannedUnrankedName', id: 7 } });
    config.banned_users_unranked[notification.user.username] = true;
    
    let result = conn.checkChallengeMandatory(notification);
    
    assert.deepEqual(result, ({ reject: true,   msg: 'You (bannedUnrankedName) are not allowed to play unranked games against this bot.' }));
  })
  
  it('should reject banned unranked users by id', () => {
    let notification = base_challenge({ ranked: false, user: { username: 'bannedUnrankedName', id: 7 } });
    config.banned_users_unranked[notification.user.id] = true;
    
    let result = conn.checkChallengeMandatory(notification);
    
    assert.deepEqual(result, ({ reject: true,   msg: 'You (bannedUnrankedName) are not allowed to play unranked games against this bot.' }));
  })
})
