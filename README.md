# gtp2ogs

[![Build Status](https://travis-ci.org/online-go/gtp2ogs.svg?branch=devel)](https://travis-ci.org/online-go/gtp2ogs)

This javascript tool allows Go bots that support GTP 
[(Go Text Protocol)](https://senseis.xmp.net/?GoTextProtocol) 
to communicate with OGS [(Online-Go.com Server)](https://online-go.com/)

No programming knowledge is needed to use it : just install it and it works.

Programming knowledge is needed only to add extra features such as displaying
and sending winrates and variations at every move, for example.

Note that some contributors already provide their custom gtp2ogs branches 
so you can download them directly or ask them if you want these features, see 
[custom branches](#custom-branches)

When you have a bot on OGS, you have total control over it : 
you put it online when you want only, and there are many settings to choose 
game settings to accept (rank, boardisze, correspondence games, etc..), but 
also options to control your GPU/computing device power spent (max number of 
simultaneous games, corrqueue, etc..)

# Full tutorial 

[for windows and linux, with screenshots, examples, and detailed explanations](https://github.com/wonderingabout/gtp2ogs-tutorial)

# Quick Guide

### 1. install node.js and npm

To install nodejs, you can :
- either use your system package manager (like apt-get for ubuntu)
- or download it from [nodejs website downloads](https://nodejs.org/en/download/) 
for linux or windows

note : installing nodejs will also install npm = node package manager. Both 
will be needed later.

### 2. install gtp2ogs using npm

- For linux in terminal :

```
sudo npm install -g gtp2ogs
```

default path install is : 
> /usr/lib/node_modules/gtp2ogs/

- For windows, open a node.js command prompt as admin, then run this command :

```
npm install -g gtp2ogs
```

default path install is something like this :
> C:\Users\yourusername\AppData\Roaming\npm\node_modules\gtp2ogs\


On all operating systems, gtp2ogs will be installed in 2 different directories, but 
**the one that needs to be run with node is gtp2ogs.js in node_modules directory**

### 3. Optional : install any missing node.js packages
 
**This step can be skipped unless you have issues or bugs**

you may need to install extra tools if the 
[Most common usage](https://github.com/wonderingabout/gtp2ogs/blob/clearer-devel/README.md#5-most-common-usage--start-gtp2ogsjs-using-nodejs) 
below fails, such as (run as `sudo` for linux, and as admin for windows)
 
```
npm install -g socket.io-client
npm install -g optimist
npm install -g tracer
  ```

### 4. Recommended : Upgrade to devel branch

This step is **is recommended**

By default, npm installs an old branch of gtp2ogs that does not include latest 
improvements, new features, and fixes

To upgrade to devel branch (newest), see :

- for linux : [3A3) Recommended : Upgrade gtp2ogs.js from old branch to “devel” branch (latest)](https://github.com/wonderingabout/gtp2ogs-tutorial/blob/master/docs/3A3-linux-optional-upgrade-to-devel.md)
- for windows : [3B3) Recommended : Upgrade gtp2ogs from old branch to devel (latest) branch](https://github.com/wonderingabout/gtp2ogs-tutorial/blob/master/docs/3B3-windows-optional-upgrade-to-devel.md)

When you upgrade you need to copy all the gtp2ogs files (bot.js, config.js, etc..) 
and overwrite the old files (you can backup your old files so that you can go back 
to the old version if you want later)

### 5. Most common usage : start gtp2ogs.js using nodejs

For linux (preferably as sudo) :

```
node /usr/lib/node_modules/gtp2ogs/gtp2ogs.js --username <yourbotusername> --apikey <apikey> <gtp2ogsargument1> <gtp2ogsargument2> -- /replace/with/full/path/to/your/ai/runfile.file <botargument1> <botargument2>
```

For windows (preferably as admin) : 

```
pushd C:\Program Files\nodejs && node.exe C:\Users\yourwindowsusername\AppData\Roaming\npm\node_modules\gtp2ogs\gtp2ogs.js --username <yourbotusername> --apikey <apikey> <gtp2ogsargument1> <gtp2ogsargument2> -- C:\Users\path\to\your\ai\executable.exe <botargument1> <botargument2>
```

note : for all operating systems, in ` -- `, the spaces after `<gtp2ogsarguments>` 
and before `/path/to/your/bot.executable` are important : they separate gtp2ogs 
arguments from your bot arguments

note 2 : the number of <gtp2ogsarguments> and <botarguments> is not limited, 
here only 2 were shown but it possible to use for example 3,4,5 , or as many as 
you want
  
note 3 : to play on [beta OGS server](https://beta.online-go.com/) instead of the 
[OGS server](https://online-go.com/), add the `-- beta` argument

note 4 : it is possible to use ISSA (intuitive semi-syllabic aliases) to write 
your gtp2ogs arguments in a much smaller size, see [notes G-](/docs/NOTES.md#g-) 
for details

### Extra : add features by editing gtp2ogs files

This step is totally not needed but can be much appreciated

To do that, programming knowledge is needed (or you can ask for help)

For example you can program gtp2ogs so that it sends winrate and 
playouts/visits information at every move, or even clickable variations, 
such as what [some bots](https://online-go.com/game/15926249) use for example.

# Options

Before putting `<gtp2ogsarguments>`, you have to put these options first :

  ```--username``` or `--u` Specify the username of the bot, for example `--username GnuGo`, 
currently there is no profile number log in support on ogs, see 
[notes A-](/docs/NOTES.md#a-) for details

  ```--apikey``` or ```--a``` Specify the API key for the bot, for example `--apikey 5srvb5es4se7651741r61devr864re`

Then, the following options are placed in the above ```<gtp2ogsarguments>``` 
section. Put a space in between options when there are more than one.
Also put a space in between the option and the parameter, for example :

  ```--startupbuffer 2 --boardsize 13,19 --noclock --unrankedonly --maxconnectedgamesperuser 1 --maxconnectedgames 10 --maxmaintime 1200 --ban UserX,playerY ---maxperiodsranked 5```
  
or with ISSA (intuitive semi-syllabic aliases) (see [notes G-](/docs/NOTES.md#g-) for details), 
the same example becomes :
  
  ```--sb 2 --bb 13,19 --nc --uo --1cgpu 1 --1cg 10 --1mt 1200 --b UserX,playerY --1pr 5```
  
note : some gtp2ogsarguments have default so they are enabled even if you don't 
specify them, such as `--komi` which default is automatic even if you dont specify it !
(default value is overwritten when you set your own value)

note 2 : if an argument has ranked and unranked in the same "family", use:
- either the general argument alone,
- OR, if you want to specify different settings for ranked and unranked games, use 
both the ranked and the unranked argument with wanted values, and then don't use the 
general argument ! (see [notes H-](/docs/NOTES.md#h-) for details)

  below is a list of all possible to use gtp2ogs arguments, use the ones you want only, 
  no need to use them all !

  ```--host```  OGS Host to connect to (default online-go.com)

  ```--port``` OGS Port to connect to (default 443)

  ```--timeout``` or ```--t``` Disconnect from a game after this many seconds (if set) 
(default 0)

  ```--insecure```  Don't use ssl to connect to the ggs/rest servers

  ```--beta```  Connect to the [beta server](https://beta.online-go.com/) instead of 
[OGS](https://online-go.com/) (sets ggs/rest hosts to the beta server)

  ```--debug``` or ```--d```  Output GTP command and responses from your Go engine

  ```--logfile``` or ```--l``` In addition to logging to the console, also log gtp2ogs 
output to a text file

  ```--json``` or ```--j```  Send and receive GTP commands in a JSON encoded format

  ```--kgstime```  Set this if bot understands the kgs-time_settings command

  ```--noclock```  or ```--nc``` Do not send any clock/time data to the bot

  ```--persist``` or ```--p```  Bot process remains running between moves

  ```--corrqueue``` or ```--cq``` Process correspondence games one at a time

  ```--maxconnectedgames``` or ```--1cg``` Maximum number of connected games 
for all users against your bot (correspondence games are currently included in 
the connected games count, see [#59](https://github.com/online-go/gtp2ogs/issues/59) 
for details) , which means the maximum number of games your bot can play at the 
same time (choose a low number to regulate your computer performance and 
stability) (default 20)

  ```--maxconnectedgamesperuser``` or ```--1cgpu``` Maximum number of 
connected games per user against this bot (default 3)

  ```--startupbuffer``` or ```--sb``` Subtract this many seconds from time 
available on first move (default 5)

  ```--rejectnew``` or ```--r``` Reject all new challenges with the default 
reject message

  ```--rejectnew --rejectnewmsg "not accepting games because blablablah"``` or 
```--r --rm "not accepting games because blablablah"``` if you add the rejectnewmsg 
argument, Reject all new challenges with a customized message instead of the default 
message. This message has to be included in "not accepting games because blablablah" 
(for example to explain why, for how long, 
if your bot is busy playing a tournament, etc...)

  ```--rejectnewfile ~/rejectnew.status```  or ```--rf``` Reject new challenges if 
file exists (checked each time, can use for load-balancing)

  ```--boardsize``` or ```--bb``` Possible boardsize values `all` (allows ALL 
boardsizes, use only if your bot can handle it !), `custom` (allows specified custom 
boardsize (for example 25x1, 9x9, 17x2 , 15x15, 3x2, etc..), and square board size 
written in numbers comma separated (default is `9,13,19` which is 9x9, 13x13, 19x19), 
see [notes E-](/docs/docs/NOTES.md#e-) for details

  ```--boardsize custom --boardsizewidth 25 --boardsizeheight 1,2,3``` or 
```--bb custom --bw 25 --bh 1,2,3``` Allows custom board size (if your bot can 
handle it), it is needed to use `custom` followed by comma separated value(s), 
in this example 25x1 25x2 25x3 are all allowed boardsizes, see 
[notes E-](/docs/docs/NOTES.md#e-) for details

  ```--komi``` or ```--k``` Possible komi values `auto` (allows Automatic komi), 
`all` (allows all komi values), and for example `7.5` (allows komi value 7.5). 
When `all` is used alone, all komi values are allowed. When an argument other 
than `all` is used, only the chosen argument komi values are allowed and all other 
komi values are rejected see [notes C-](/docs/docs/NOTES.md#c-) and [notes D-](/docs/docs/NOTES.md#d-) 
for details (default auto)

  ```--ban```  or ```--b``` Comma separated list of user names or IDs 
(e.g.  UserA,UserB,UserC  do not put spaces in between)

  ```--banranked```  or ```--br``` Comma separated list of user names or IDs who 
are banned from playing ranked games

  ```--banunranked```  or ```--bu``` Comma separated list of user names or IDs who 
are banned from playing unranked game

  ```--speed```  or ```--s``` Comma separated list of Game speed(s) to accept 
(default blitz,live,correspondence)

  ```--timecontrol```  or ```--tc``` Time control(s) to accept (default fischer,
byoyomi,simple,canadian,absolute,none)

  ```--minmaintime```  or ```--0mt``` Minimum seconds of main time (rejects time 
control simple and none) (default 60)

  ```--maxmaintime```  or ```--1mt``` Maximum seconds of main time (rejects time 
control simple and none) (default 7200)

  ```--minmaintimeranked```  or ```--0mtr``` Minimum seconds of main time for 
ranked games (rejects time control simple and none)

  ```--maxmaintimeranked```  or ```--1mtr``` Maximum seconds of main time for 
ranked games (rejects time control simple and none)

  ```--minmaintimeunranked```  or ```--0mtu``` Minimum seconds of main time 
for unranked games (rejects time control simple and none)

  ```--maxmaintimeunranked```  or ```--1mtu``` Maximum seconds of main time for 
unranked games (rejects time control simple and none)

  ```--minperiodtime```  or ```--0pt``` Minimum seconds per period (per stone 
in canadian) (default 10)

  ```--maxperiodtime```  or ```--1pt``` Maximum seconds per period (per stone 
in canadian) (default 120)

  ```--minperiodtimeranked```  or ```--0ptr``` Minimum seconds per period for 
ranked games (per stone in canadian)

  ```--maxperiodtimeranked```  or ```--1ptr``` Maximum seconds per period for 
ranked games (per stone in canadian)

  ```--minperiodtimeunranked```  or ```--0ptu``` Minimum seconds per period for 
unranked games (per stone in canadian)

  ```--maxperiodtimeunranked```  or ```--1ptu``` Maximum seconds per period for 
unranked games (per stone in canadian)

  ```--minperiods```  or ```--0p``` Minimum number of periods (default 3)

  ```--minperiodsranked```  or ```--0pr``` Minimum number of ranked periods

  ```--minperiodsunranked```  or ```--0pu``` Minimum number of unranked periods

  ```--maxperiods```  or ```--1p``` Maximum number of periods (default 20)

  ```--maxperiodsranked```  or ```--1pr``` Maximum number of ranked periods

  ```--maxperiodsunranked```  or ```--1pu``` Maximum number of unranked periods

  ```--minrank```  or ```--0r``` Minimum opponent rank to accept (e.g. 15k)

  ```--minrankranked```  or ```--0rr``` Minimum opponent rank to accept for 
ranked games (e.g. 15k)

  ```--minrankunranked```  or ```--0ru``` Minimum opponent rank to accept for 
unranked games (e.g. 15k)

  ```--maxrank```  or ```--1r``` Maximum opponent rank to accept (e.g. 1d)

  ```--maxrankranked```  or ```--1rr``` Maximum opponent rank to accept for 
ranked games (e.g. 1d)

  ```--maxrankunranked```  or ```--1ru``` Maximum opponent rank to accept for 
unranked games (e.g. 1d)

  ```--greeting "Hello, have a nice game"```  or ```--g "Hello, have a nice game"``` 
Greeting message to appear in chat at first move (ex: "Hello, have a nice game")

  ```--farewell "Thank you for playing"```  or ```--f "Thank you for playing"``` 
Thank you message to appear in chat at end of game (ex: "Thank you for playing")

  ```--proonly```  or ```--po``` Only accept matches from professionals

  ```--rankedonly```  or ```--ro``` Only accept ranked matches

  ```--unrankedonly``` or ```--uo```  Only accept unranked matches

  ```--minhandicap``` or ```--0h```  Min handicap for all games

  ```--maxhandicap``` or ```--1h```  Max handicap for all games

  ```--minhandicapranked``` or ```--0hr```  Min handicap for ranked games

  ```--maxhandicapranked```  or ```--1hr``` Max handicap for ranked games

  ```--minhandicapunranked```  or ```--0hu``` Min handicap for unranked games

  ```--maxhandicapranked```  or ```--0hr``` Max handicap for unranked games
  
  ```--noautohandicap``` or ```--nah``` Do not allow handicap to be set to -automatic-

  ```--noautohandicapranked``` or ```--nahr``` Do not allow handicap to be set to 
-automatic- for ranked games
  
  ```--noautohandicapunranked``` or ```--nahu``` Do not allow handicap to be set to 
-automatic- for unranked games

  ```--nopause``` or ```--np```  Do not allow games to be paused

  ```--nopauseranked```  or ```--npr``` Do not allow ranked games to be paused

  ```--nopauseunranked```  or ```--npu``` Do not allow unranked games to be paused

  ```--hidden``` or ```--h``` Hides the botname from the OGS game "Play against 
computer" bot list (but it can still accept challenges)

After that, add a ``` -- ``` (with one space before and one space after the `--` ), 
to separate `<gtp2ogsarguments>` from your bot path and `<botarguments>`, as 
shown in 
[Most common usage earlier](/docs/NOTES.md#5-most-common-usage--start-gtp2ogsjs-using-nodejs)

## Notes :

A page summarizing the notes and details about gtp2ogs use can be viewed [here](/docs/NOTES.md)

# Custom branches

Some branches add some nice features like 
**displaying variations (PV) ingame for Leela zero and PhoenixGo**

See [Custom Branches](/docs/CUSTOM-BRANCHES.md)

# Discord chat : 

if you're read that far, maybe you'll be interested to share your bot experience with 
bot admins or see talked topic !

come on the leela zero discord in `#bots` channel and follow the talk with everyone !

https://discord.gg/HZ23Cp9

This discord can also be useful if you want to have fast and quick, interactive chat !

You can also use the discord to ask simple and quick questions

However, if you have a problem and it needs some explanations and time, it is common 
github practices to use the ["Issues"](https://github.com/online-go/gtp2ogs/issues) 
forum instead

# Contributing

You like gtp2ogs and want to improve it ?

found a bugfix ?

want to add a new feature ?

Welcome !

come help us all make gtp2ogs more awesome than it already is ! 

Read Contributing instructions [here](/docs/CONTRIBUTING.md)

