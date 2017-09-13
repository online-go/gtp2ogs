gtp2ogs
=======

This script allows Go bots that support GTP (Go Text Protocol) to communicate
with OGS (Online-Go.com Server)

Installation
============

  1. Use your systems package manager or otherwise install `node.js` from http://nodejs.org/
  2. Run
    ```
    npm install -g gtp2ogs
    ```
  3. Install any missing node.js packages if basic usage below fails, such as:
    ```
    npm install socket.io-client
    npm install optimist
    npm install tracer
    ```


Basic usage
===========

```
gtp2ogs --botid <id> --apikey <apikey> <arguments> -- <bot command> <bot arguments>
```
 The space in front of ```<bot command>``` is important

Options
=======
    --insecure  ```Don't use ssl to connect to the ggs/rest servers```
    --beta  'Connect to the beta server (sets ggs/rest hosts to the beta server)'
    --debug  'Output GTP command and responses from your Go engine to the log'
    --json  'Send and receive GTP commands in a JSON encoded format'
    --persist  'Bot process remains running between moves'
    --kgstime  'Set this if bot understands the kgs-time_settings command'
    --noclock  'Do not send any clock/time data to the bot'
    --startupbuffer 'Subtract this many seconds from time available on first move' (default 5)
    --rejectnew  'Reject all new challenges'
    --boardsize  'Board size(s) to accept' (default  9,13,19)
    --ban  'Comma separated list of user names or IDs' (e.g.  UserA,UserB,UserC  do not put spaces in between)
    --banranked  'Comma separated list of user names or IDs who are banned from playing ranked games'
    --banunranked  'Comma separated list of user names or IDs who are banned from playing unranked games'
    --speed  'Comma separated list of Game speed(s) to accept' (default  blitz,live,correspondence)
    --timecontrol  'Time control(s) to accept'
    (default  fischer,byoyomi,simple,canadian,absolute,none)
    --minmaintime  'Minimum seconds of main time (rejects time control simple and none)'
    --maxmaintime  'Maximum seconds of main time (rejects time control simple and none)'
    --minperiodtime  'Minimum seconds per period (per stone in canadian)'
    --maxperiodtime  'Maximum seconds per period (per stone in canadian)'
    --minperiods  'Minimum number of periods'
    --minperiodsranked  'Minimum number of ranked periods'
    --minperiodsunranked  'Minimum number of unranked periods'
    --maxperiods  'Maximum number of periods'
    --maxperiodsranked  'Maximum number of ranked periods'
    --maxperiodsunranked  'Maximum number of unranked periods'
    --minrank  'Minimum opponent rank to accept (e.g. 15k)'
    --maxrank  'Maximum opponent rank to accept (e.g. 1d)'
    --proonly  'Only accept matches from professionals'
    --rankedonly  'Only accept ranked matches'
    --unrankedonly  'Only accept unranked matches'
    --maxhandicap  'Max handicap for all games'
    --maxrankedhandicap  'Max handicap for ranked games'
    --maxunrankedhandicap  'Max handicap for unranked games'
    --nopause  'Do not allow games to be paused'
    --nopauseranked  'Do not allow ranked games to be paused'
    --nopauseunranked  'Do not allow unranked games to be paused'