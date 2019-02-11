# gtp2ogs

[![Build Status](https://travis-ci.org/online-go/gtp2ogs.svg?branch=devel)](https://travis-ci.org/online-go/gtp2ogs)

This javascript tool allows Go bots that support GTP 
[(Go Text Protocol)](https://senseis.xmp.net/?GoTextProtocol) 
to communicate with OGS [(Online-Go.com Server)](https://online-go.com/)

No programming knowledge is needed to use it : just install it and it works.

Programming knowledge is needed only to add extra features such as displaying
and sending winrates and variations at every move, for example.

Note that some contributors already provide their custom gtp2ogs branches 
so you can download them directly or ask them if you want these features, 
see [custom branches](#custom-branches)

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

### Extra : add features by editing gtp2ogs files

This step is totally not needed but can be much appreciated

To do that, programming knowledge is needed (or you can ask for help)

However, some contributors freely provide their custom branches, see 
[custom branches](#custom-branches)

# Options

Before putting `<gtp2ogsarguments>`, you have to put these options first :

  ```--username Specify the username of the bot, for example `--username GnuGo`, 
currently there is no profile number log in support on ogs, see 
[notes A-](/docs/NOTES.md#a-) for details

  ```--apikey Specify the API key for the bot, for example `--apikey 5srvb5es4se7651741r61devr864re`

Then, the following options are placed in the above ```<gtp2ogsarguments>``` 
section. Put a space in between options when there are more than one.
Also put a space in between the option and the parameter, for example :

  ```--startupbuffer 2 --boardsize 13,19 --noclock --unrankedonly --maxconnectedgamesperuser 1 --maxmaintimelive 600 --maxperiodtimecorr 86400 --maxconnectedgames 10 --ban UserX,playerY ---maxperiodsranked 5```
  
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

  ```--timeout``` Disconnect from a game after this many seconds (if set) 
(default 0)

  ```--insecure```  Don't use ssl to connect to the ggs/rest servers

  ```--beta```  Connect to the [beta server](https://beta.online-go.com/) instead of 
[OGS](https://online-go.com/) (sets ggs/rest hosts to the beta server)

  ```--debug```  Output GTP command and responses from your Go engine

  ```--logfile``` In addition to logging to the console, also log gtp2ogs 
output to a text file

  ```--json```  Send and receive GTP commands in a JSON encoded format

  ```--kgstime```  Set this if bot understands the kgs-time_settings command

  ```--noclock``` Do not send any clock/time data to the bot

  ```--persist```  Bot process remains running between moves

  ```--corrqueue``` Process correspondence games one at a time

  ```--maxconnectedgames``` Maximum number of connected games 
for all users against your bot (correspondence games are currently included in 
the connected games count, see [#59](https://github.com/online-go/gtp2ogs/issues/59) 
for details) , which means the maximum number of games your bot can play at the 
same time (choose a low number to regulate your computer performance and 
stability) (default 20)

  ```--maxconnectedgamesperuser``` Maximum number of 
connected games per user against this bot (default 3)

  ```--startupbuffer``` Subtract this many seconds from time 
available on first move (default 5)

  ```--rejectnew``` Reject all new challenges with the default 
reject message

  ```--rejectnew --rejectnewmsg "not accepting games because blablablah"``` 
if you add the rejectnewmsg argument, Reject all new challenges with a customized 
message instead of the default message. This message has to be included in 
"not accepting games because blablablah" (for example to explain why, for how long, 
if your bot is busy playing a tournament, etc...)

  ```--rejectnewfile ~/rejectnew.status``` Reject new challenges if 
file exists (checked each time, can use for load-balancing)

  ```--boardsize``` Possible boardsize values `all` (allows ALL 
boardsizes, use only if your bot can handle it !), `custom` (allows specified custom 
boardsize (for example 25x1, 9x9, 17x2 , 15x15, 3x2, etc..), and square board size 
written in numbers comma separated (default is `9,13,19` which is 9x9, 13x13, 19x19), 
see [notes E-](/docs/docs/NOTES.md#e-) for details

  ```--boardsize custom --boardsizewidth 25 --boardsizeheight 1,2,3``` Allows custom 
board size (if your bot can handle it), it is needed to use `custom` followed by 
comma separated value(s), in this example 25x1 25x2 25x3 are all allowed boardsizes, 
see [notes E-](/docs/docs/NOTES.md#e-) for details

  ```--komi``` Possible komi values `auto` (allows Automatic komi), 
`all` (allows all komi values), and for example `7.5` (allows komi value 7.5). 
When `all` is used alone, all komi values are allowed. When an argument other 
than `all` is used, only the chosen argument komi values are allowed and all other 
komi values are rejected see [notes C-](/docs/docs/NOTES.md#c-) and [notes D-](/docs/docs/NOTES.md#d-) 
for details (default auto)

  ```--ban``` Comma separated list of user names or IDs 
(e.g.  UserA,UserB,UserC  do not put spaces in between)

  ```--banranked``` Comma separated list of user names or IDs who 
are banned from playing ranked games

  ```--banunranked``` Comma separated list of user names or IDs who 
are banned from playing unranked game

  ```--speed``` Comma separated list of Game speed(s) to accept 
(default blitz,live,correspondence)

  ```--timecontrol``` Time control(s) to accept (default fischer,
byoyomi,simple,canadian,absolute,none)

  ```--minmaintimeblitz``` Minimum seconds of main time for 
blitz games (default 15 , which is 15 seconds)

  ```--maxmaintimeblitz``` Maximum seconds of main time for 
blitz games (default 300, which is 5 minutes)

  ```--minmaintimeblitzranked``` Minimum seconds of main time for 
blitz ranked games 

  ```--maxmaintimeblitzranked``` Maximum seconds of main time for 
blitz ranked games 

  ```--minmaintimeblitzunranked``` Minimum seconds of main time 
for blitz unranked games 

  ```--maxmaintimeblitzunranked``` Maximum seconds of main time for 
blitz unranked games 

  ```--minmaintimelive``` Minimum seconds of main time for 
live games (default 30 , which is 30 seconds)

  ```--maxmaintimelive``` Maximum seconds of main time for 
live games (default 7200, which is 2 hours)

  ```--minmaintimeliveranked``` Minimum seconds of main time for 
live ranked games 

  ```--maxmaintimeliveranked``` Maximum seconds of main time for 
live ranked games 

  ```--minmaintimeliveunranked``` Minimum seconds of main time 
for live unranked games 

  ```--maxmaintimeliveunranked``` Maximum seconds of main time for 
live unranked games 

  ```--minmaintimecorr``` Minimum seconds of main time for 
correspondence games (default 259200 , which is 3 days)

  ```--maxmaintimecorr``` Maximum seconds of main time for 
correspondence games (default 604800, which is 7 days)

  ```--minmaintimecorrranked``` Minimum seconds of main time for 
correspondence ranked games 

  ```--maxmaintimecorrranked``` Maximum seconds of main time for 
correspondence ranked games 

  ```--minmaintimecorrunranked``` Minimum seconds of main time 
for correspondence unranked games 

  ```--maxmaintimecorrunranked``` Maximum seconds of main time for 
correspondence unranked games 

  ```--minperiods``` Minimum number of periods (default 3)

  ```--minperiodsranked``` Minimum number of ranked periods

  ```--minperiodsunranked``` Minimum number of unranked periods

  ```--maxperiods``` Maximum number of periods (default 20)

  ```--maxperiodsranked``` Maximum number of ranked periods

  ```--maxperiodsunranked``` Maximum number of unranked periods

For period times below, if timecontrol is canadian, divide the period time 
by the number of stones per period, 

for example max periodtime 
5 minutes / 25 stones = 5*60 /25 = maxperiodtime = 12 

  ```--minperiodtimeblitz``` Minimum seconds per period 
(average time per stone if timecontrol is canadian) for blitz games 
(default 5 , which is 5 seconds)

  ```--maxperiodtimeblitz``` Maximum seconds per period 
(average time per stone if timecontrol is canadian) for blitz games 
(default 10 , which is 10 seconds)

  ```--minperiodtimeblitzranked``` Minimum seconds per period 
(average time per stone if timecontrol is canadian) for blitz ranked games 

  ```--maxperiodtimeblitzranked``` Maximum seconds per period 
(average time per stone if timecontrol is canadian) for blitz ranked games 

  ```--minperiodtimeblitzunranked``` Minimum seconds per period 
(average time per stone if timecontrol is canadian) for blitz unranked games 

  ```--maxperiodtimeblitzunranked``` Maximum seconds per period 
(average time per stone if timecontrol is canadian) for blitz unranked games 

  ```--minperiodtimelive``` Minimum seconds per period 
(average time per stone if timecontrol is canadian) for live games 
(default 10 , which is 10 seconds)

  ```--maxperiodtimelive``` Maximum seconds per period 
(average time per stone if timecontrol is canadian) for live games 
(default 120 , which is 2 minutes)

  ```--minperiodtimeliveranked``` Minimum seconds per period 
(average time per stone if timecontrol is canadian) for live ranked games 

  ```--maxperiodtimeliveranked``` Maximum seconds per period 
(average time per stone if timecontrol is canadian) for live ranked games 

  ```--minperiodtimeliveunranked``` Minimum seconds per period 
(average time per stone if timecontrol is canadian) for live unranked games 

  ```--maxperiodtimeliveunranked``` Maximum seconds per period 
(average time per stone if timecontrol is canadian) for live unranked games 

  ```--minperiodtimecorr``` Minimum seconds per period 
(average time per stone if timecontrol is canadian) for correspondence games 
(default 14400 , which is 4 hours)

  ```--maxperiodtimecorr``` Maximum seconds per period 
(average time per stone if timecontrol is canadian) for correspondence games 
(default 259200 , which is 3 days)

  ```--minperiodtimecorrranked``` Minimum seconds per period 
(average time per stone if timecontrol is canadian) for correspondence ranked games 

  ```--maxperiodtimecorrranked``` Maximum seconds per period 
(average time per stone if timecontrol is canadian) for correspondence ranked games 

  ```--minperiodtimecorrunranked``` Minimum seconds per period 
(average time per stone if timecontrol is canadian) for correspondence unranked games 

  ```--maxperiodtimecorrunranked``` Maximum seconds per period 
(average time per stone if timecontrol is canadian) for correspondence unranked games 

  ```--minrank``` Minimum opponent rank to accept (e.g. 15k)

  ```--minrankranked``` Minimum opponent rank to accept for 
ranked games (e.g. 15k)

  ```--minrankunranked``` Minimum opponent rank to accept for 
unranked games (e.g. 15k)

  ```--maxrank``` Maximum opponent rank to accept (e.g. 1d)

  ```--maxrankranked``` Maximum opponent rank to accept for 
ranked games (e.g. 1d)

  ```--maxrankunranked``` Maximum opponent rank to accept for 
unranked games (e.g. 1d)

  ```--greeting "Hello, have a nice game"``` 
Greeting message to appear in chat at first move (ex: "Hello, have a nice game")

  ```--farewell "Thank you for playing"``` 
Thank you message to appear in chat at end of game (ex: "Thank you for playing")

  ```--proonly``` Only accept matches from professionals

  ```--rankedonly``` Only accept ranked matches

  ```--unrankedonly```  Only accept unranked matches

  ```--minhandicap```  Min handicap for all games

  ```--maxhandicap```  Max handicap for all games

  ```--minhandicapranked```  Min handicap for ranked games

  ```--maxhandicapranked``` Max handicap for ranked games

  ```--minhandicapunranked``` Min handicap for unranked games

  ```--maxhandicapranked``` Max handicap for unranked games
  
  ```--noautohandicap``` Do not allow handicap to be set to -automatic-

  ```--noautohandicapranked``` Do not allow handicap to be set to 
-automatic- for ranked games
  
  ```--noautohandicapunranked``` Do not allow handicap to be set to 
-automatic- for unranked games

  ```--nopause```  Do not allow games to be paused

  ```--nopauseranked``` Do not allow ranked games to be paused

  ```--nopauseunranked``` Do not allow unranked games to be paused

  ```--hidden``` Hides the botname from the OGS game "Play against 
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

