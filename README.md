# gtp2ogs

This javascript tool allows Go bots that support GTP [(Go Text Protocol)](https://senseis.xmp.net/?GoTextProtocol) to communicate with OGS [(Online-Go.com Server)](https://online-go.com/)

No programming knowledge is needed to use it : just install it and it works.

Programming knowledge is needed only to add extra features such as displaying and sending winrates and variations at every move, for example.

# Full tutorial 

[for linux and windows, with screenshots, examples, and detailed explanations](https://github.com/wonderingabout/gtp2ogs-tutorial)

# Quick Guide

### 1. install node.js and npm

To install nodejs, you can :
- either use your system package manager (like apt-get for ubuntu)
- or download it from [nodejs website downloads](https://nodejs.org/en/download/) for linux or windows

note : installing nodejs will also install npm = node package manager. Both will be needed later.

### 2. install gtp2ogs using npm

- For linux in terminal :

```
sudo npm install -g gtp2ogs
```

default path install is : 
> /usr/lib/node_modules/gtp2ogs/gtp2ogs.js

- For windows, open a node.js command prompt as admin, then run this command :

```
npm install -g gtp2ogs
```

default path install is something like this :
> C:\Users\yourusername\AppData\Roaming\npm\node_modules\gtp2ogs\gtp2ogs.js


On all operating systems, gtp2ogs will be installed in 2 different directories, but **the one that needs to be run with node is gtp2ogs.js in node_modules directory**

### 3. Optional : install any missing node.js packages
 
**This step can be skipped**

you may need to install extra tools if the [Most common usage](https://github.com/wonderingabout/gtp2ogs/blob/clearer-devel/README.md#5-most-common-usage--start-gtp2ogsjs-using-nodejs) below fails, such as
(run as `sudo` for linux, and as admin for windows)
 
```
npm install -g socket.io-client
npm install -g optimist
npm install -g tracer
  ```

### 4. Recommended : Upgrade to devel branch

This step is **is recommended**

By default, npm installs an old branch of gtp2ogs that does not include latest improvements, new features, and fixes

To upgrade to devel branch (newest), see :

- for linux : [3A3) Recommended : Upgrade gtp2ogs.js from old branch to “devel” branch (latest)](https://github.com/wonderingabout/gtp2ogs-tutorial/blob/master/docs/3A3-linux-optional-upgrade-to-devel.md)
- for windows : [3B3) Recommended : Upgrade gtp2ogs from old branch to devel (latest) branch](https://github.com/wonderingabout/gtp2ogs-tutorial/blob/master/docs/3B3-windows-optional-upgrade-to-devel.md)

### 5. Most common usage : start gtp2ogs.js using nodejs

For linux (preferably as sudo) :

```
node /usr/lib/node_modules/gtp2ogs/gtp2ogs.js --username <yourbotusername> --apikey <apikey> <gtp2ogsargument1> <gtp2ogsargument2> -- /replace/with/full/path/to/your/ai/runfile.file <botargument1> <botargument2>
```

For windows (preferably as admin) : 

```
pushd C:\Program Files\nodejs && node.exe C:\replace\with\full\path\to\node_modules\gtp2ogs\gtp2ogs.js --username <yourbotusername> --apikey <apikey> <gtp2ogsargument1> <gtp2ogsargument2> -- C:\Users\path\to\your\ai\executable.exe <botargument1> <botargument2>
```

note : for all operating systems, in ` -- `, the spaces after `<gtp2ogsarguments>` and before `/path/to/your/bot.executable` are important : they separate gtp2ogs arguments from your bot arguments

note 2 : the number of <gtp2ogsarguments> and <botarguments> is not limited, here only 2 were shown but it possible to use for example 3,4,5 , or as many as you want
  
note 3 : to play on [beta OGS server](https://beta.online-go.com/) instead of the [OGS server](https://online-go.com/), add the `-- beta` argument

### Extra : add features by editing gtp2ogs.js file

This step is totally not needed but can be much appreciated

To do that, programming knowledge is needed (or you can ask for help)

For example you can program the gtp2ogs.js so that it sends winrate and playouts/visits information at every move, or even clickable variations, such as how [some bots](https://online-go.com/game/15926249) do for example

# Options

The following options are placed in the above ```<gtp2ogsarguments>``` section.  Put a space in between options when there are more than one.  Also put a space in between the option and the parameter like:

  ```--startupbuffer 2 --boardsize 13,19 --ban UserX,playerY ```

  ```--host```  OGS Host to connect to (default online-go.com)

  ```--port``` OGS Port to connect to (default 443)

  ```--timeout``` Disconnect from a game after this many seconds (if set) (default 0)

  ```--insecure```  Don't use ssl to connect to the ggs/rest servers

  ```--beta```  Connect to the [beta server](https://beta.online-go.com/) instead of [OGS](https://online-go.com/) (sets ggs/rest hosts to the beta server)

  ```--debug, -d```  Output GTP command and responses from your Go engine

  ```--json, -j```  Send and receive GTP commands in a JSON encoded format

  ```--kgstime```  Set this if bot understands the kgs-time_settings command

  ```--noclock```  Do not send any clock/time data to the bot

  ```--persist```  Bot process remains running between moves

  ```--corrqueue```  Process correspondence games one at a time

  ```--maxtotalgames``` Maximum number of total games, maxtotalgames is actually the maximum total number of connected games for your bot (correspondence games are currently included in the connected games count if you use `--persist` ) , which means the maximum number of games your bot can play at the same time (choose a low number to regulate your GPU use)

  ```--maxactivegames``` Maximum number of active games per player against this bot

  ```--startupbuffer``` Subtract this many seconds from time available on first move (default 5)

  ```--rejectnew```  Reject all new challenges with the default reject message

  ```--rejectnew --rejectnewmsg "not accepting games because blablablah"```  if you add the rejectnewmsg argument, Reject all new challenges with a customized message instead of the default message. This message has to be included in "not accepting games because blablablah" (for example to explain why, for how long, if your bot is busy playing a tournament, etc...)

  ```--rejectnewfile ~/rejectnew.status```  Reject new challenges if file exists (checked each time, can use for load-balancing)

  ```--boardsize```  Board size(s) to accept (default 9,13,19)

  ```--komi``` Possible komi values `auto` (allows Automatic komi), `any` (allows all komi values), and for example `7.5` (allows komi value 7.5). When `any` is used alone, all komi values are allowed. When an argument other than `any` is used, only the chosen argument komi values are allowed and all other komi values are rejected see [notes](/README.md#notes-) for details

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

  ```--minrank```  Minimum opponent rank to accept (e.g. 15k)

  ```--maxrank```  Maximum opponent rank to accept (e.g. 1d)

  ```--greeting "Hello, have a nice game"```  Greeting message to appear in chat at first move (ex: "Hello, have a nice game")

  ```--farewell "Thank you for playing"```  Thank you message to appear in chat at end of game (ex: "Thank you for playing")

  ```--proonly```  Only accept matches from professionals

  ```--rankedonly```  Only accept ranked matches

  ```--unrankedonly```  Only accept unranked matches

  ```--minhandicap```  Min handicap for all games

  ```--maxhandicap```  Max handicap for all games

  ```--minrankedhandicap```  Min handicap for ranked games

  ```--maxrankedhandicap```  Max handicap for ranked games

  ```--minunrankedhandicap```  Min handicap for unranked games

  ```--maxunrankedhandicap```  Max handicap for unranked games

  ```--nopause```  Do not allow games to be paused

  ```--nopauseranked```  Do not allow ranked games to be paused

  ```--nopauseunranked```  Do not allow unranked games to be paused

  ```--hidden```  Hides the botname from the OGS game "Play against computer" bot list (but it can still accept challenges)

## notes :

#### 1.

a list of gtp2ogs arguments is also available [here](https://github.com/online-go/gtp2ogs/blob/devel/gtp2ogs.js) (ctrl+f "describe")

#### 2 : 

on OGS, black player will always get the handicap stones regardless of rank difference (if auto (automatic) komi is selected, the komi will be 0.5 , 

but you can restrict allowed komi for example to only 7.5 or auto with `--komi 7.5,auto` , or only 7.5 komi with `--komi 7.5` to play handicap games with 7.5 komi if your bot does not support 0.5 komi value.

#### 3 :

explanation on how to use komi argument:

- `--komi auto,0.5,7.5` for example, will allow any of these komi values : automatic(auto), 0.5, or 7.5, and will reject any other value
- another example `--komi 7.5` will only accept komi value 7.5 and will reject any other value. In that example, note that if `auto` (automatic) komi happens to have the value 7.5, the auto value will be set to 7.5 and will be accepted and game will start (bots will always replace any rules with chinese rules, so a non handicap game 19x19 on ogs against a bot will always have the komi 7.5)
- the `--komi 7.5` can be useful if your bot handles handicap well, but only with the value 7.5 for example (and not 0.5)

#### 4 : 

when using the "msg" arguments (`--greeting` , `--farewell` , `--rejectnew --rejectnewmsg` , some special characters will make gtp2ogs crash, such as `!!` (two times `!`) , so test special characters in your messages with caution 

these special characters have been tested to work on messages, among others :  `!` (one time `!`) , `?` , `,` , `(` , `)` , `:` , `;` 

