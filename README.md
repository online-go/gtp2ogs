# gtp2ogs

This script allows Go bots that support GTP (Go Text Protocol) to communicate
with [OGS (Online-Go.com Server)](https://online-go.com/)

# Full tutorial 

[for linux and windows, with screenshots, examples, and detailed explanations](https://github.com/wonderingabout/gtp2ogs-tutorial)

# Installation

  1. Use your systems package manager or otherwise install `node.js` from http://nodejs.org/

  2. Run
    ```
    npm install gtp2ogs
    ```
If npm install gives you an error, try doing the above commands with ```sudo npm install -g gtp2ogs``` instead.

  3. Optionally install any missing node.js packages if basic usage below fails, such as:
    ```
    npm install socket.io-client
    npm install optimist
    npm install tracer
    ```

# Basic usage

for linux (preferably as sudo) :

```
node /path/to/node_modules/gtp2ogs/gtp2ogs.js --botid <id> --apikey <apikey> <gtp2ogsargument1> <gtp2ogsargument2> -- path/to/your/ai/runfile.file <bot argument1> <bot argument2>
```

for windows (preferably as admin) : 

```
pushd C:\Program Files\nodejs && node.exe C:\path\to\node_modules\gtp2ogs\gtp2ogs.js --botid <id> --apikey <apikey> <gtp2ogsargument1> <gtp2ogsargument2> -- C:\Users\path\to\your\ai\executable.exe <bot arguments>
```

note : for all operating systemps, in ` -- `, the spaces after <gtp2ogsarguments> and before path/to/your/bot.executable are important : they separate gtp2ogs arguments from your bot arguments

note 2 : to play on [beta OGS server](https://beta.online-go.com/) instead of the [OGS server](https://online-go.com/), add the `-- beta` argument

# Optional : To upgrade to devel branch

By default, npm installs an old release that does not include latest improvements and fixes

To upgrade to devel branch, see :

- for linux : [3A3) Optional : Upgrade gtp2ogs.js from old branch to “devel” branch (latest)](/docs/3A3-linux-optional-upgrade-to-devel.md)
- for windows : [3B3) Optional : Upgrade gtp2ogs from old branch to devel (latest) branch](/docs/3B3-windows-optional-upgrade-to-devel.md)

# Optional : workaround for komi not supported by your engine

If your bot engine does not support all komi values, it is likely that some games will fail to start and be played

For example [PhoenixGo](https://github.com/Tencent/PhoenixGo) only supports a komi of 7.5, and any other komi value chosen will crash the bot (including the widespread 6.5 and 0.5 komi)

There is no `--komi` gtp2ogs argument yet, that would reject games that do not have the wanted komi, however there is a workaround of editing gtp2ogs.js so that it will tell your engine that the komi wil always be the set value (for example 7.5).

This method will result in some uncorrect scoring (so do not use it for ranked games), but at least your engine will be able to play

for more details, see : 

- for linux : [3A4) Optional : Edit the gtp2ogs.js file (for example force komi to 7.5)](3A4-linux-optional-edit-gtp2ogs-js-file.md)
- for windows : [3B4) Optional : Modify the gtp2ogs.js file (for example force komi to 7.5)](/docs/3B4-windows-optional-edit-gtp2ogs-js-file.md)

# Options

The following options are placed in the above ```<arguments>``` section.  Put a space in between options when there are more than one.  Also put a space in between the option and the parameter like:

```
--startupbuffer 2 --boardsize 13,19 --ban UserX,playerY ```

  ```--host```  OGS Host to connect to (default online-go.com)

  ```--port``` OGS Port to connect to (default 443)

  ```--timeout``` Disconnect from a game after this many seconds (if set) (default 0)

  ```--insecure```  Don't use ssl to connect to the ggs/rest servers

  ```--beta```  Connect to the [beta server](https://beta.online-go.com/) instead of [OGS](https://online-go.com/) (sets ggs/rest hosts to the beta server)

  ```--debug, -d```  Output GTP command and responses from your Go engine

  ```--json, -j```  Send and receive GTP commands in a JSON encoded format

  ```--persist```  Bot process remains running between moves

  ```--kgstime```  Set this if bot understands the kgs-time_settings command

  ```--noclock```  Do not send any clock/time data to the bot

  ```--corrqueue```  Process correspondence games one at a time

  ```--startupbuffer``` Subtract this many seconds from time available on first move (default 5)

  ```--rejectnew```  Reject all new challenges

  ```--rejectnewfile ~/rejectnew.status```  Reject new challenges if file exists (checked each time, can use for load-balancing)

  ```--boardsize```  Board size(s) to accept (default 9,13,19)

  ```--ban```  Comma separated list of user names or IDs (e.g.  UserA,UserB,UserC  do not put spaces in between)

  ```--banranked```  Comma separated list of user names or IDs who are banned from playing ranked games

  ```--banunranked```  Comma separated list of user names or IDs who are banned from playing unranked game

  ```--speed```  Comma separated list of Game speed(s) to accept (default blitz,live,correspondence)

  ```--timecontrol```  Time control(s) to accept (default fischer,byoyomi,simple,canadian,absolute,none)

  ```--minmaintime```  Minimum seconds of main time (rejects time control simple and none)

  ```--maxmaintime```  Maximum seconds of main time (rejects time control simple and none)

  ```--minperiodtime```  Minimum seconds per period (per stone in canadian)

  ```--maxperiodtime```  Maximum seconds per period (per stone in canadian)

  ```--minperiods```  Minimum number of periods

  ```--minperiodsranked```  Minimum number of ranked periods

  ```--minperiodsunranked```  Minimum number of unranked periods

  ```--maxperiods```  Maximum number of periods

  ```--maxperiodsranked```  Maximum number of ranked periods

  ```--maxperiodsunranked```  Maximum number of unranked periods

  ```--maxactivegames``` Maximum number of active games per player

  ```--minrank```  Minimum opponent rank to accept (e.g. 15k)

  ```--maxrank```  Maximum opponent rank to accept (e.g. 1d)

  ```--greeting```  Greeting message to appear in chat at first move (ex: "Hello, have a nice game")

  ```--farewell```  Thank you message to appear in chat at end of game (ex: "Thank you for playing")

  ```--proonly```  Only accept matches from professionals

  ```--rankedonly```  Only accept ranked matches

  ```--unrankedonly```  Only accept unranked matches

  ```--maxhandicap```  Max handicap for all games

  ```--maxrankedhandicap```  Max handicap for ranked games

  ```--maxunrankedhandicap```  Max handicap for unranked games

  ```--nopause```  Do not allow games to be paused

  ```--nopauseranked```  Do not allow ranked games to be paused

  ```--nopauseunranked```  Do not allow unranked games to be paused

  ```--hidden```  Hides the botname from the OGS game creation bot list

note : a list of gtp2ogs arguments is also available [here](https://github.com/online-go/gtp2ogs/blob/devel/gtp2ogs.js) (ctrl+f "describe")

