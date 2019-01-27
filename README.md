# gtp2ogs

This javascript tool allows Go bots that support GTP 
[(Go Text Protocol)](https://senseis.xmp.net/?GoTextProtocol) 
to communicate with OGS [(Online-Go.com Server)](https://online-go.com/)

No programming knowledge is needed to use it : just install it and it works.

Programming knowledge is needed only to add extra features such as displaying
and sending winrates and variations at every move, for example.

Note that some contributors already provide their custom gtp2ogs branches 
so you can download them directly or ask them if you want these features

When you have a bot on OGS, you have total control over it : 
you put it online when you want only, and there are many settings to choose 
game settings to accept (rank, boardisze, etc..), but also options to control 
your GPU/computing device power spent (max number of simultaneous games, corrqueue, etc..)

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
> /usr/lib/node_modules/gtp2ogs/gtp2ogs.js

- For windows, open a node.js command prompt as admin, then run this command :

```
npm install -g gtp2ogs
```

default path install is something like this :
> C:\Users\yourusername\AppData\Roaming\npm\node_modules\gtp2ogs\gtp2ogs.js


On all operating systems, gtp2ogs will be installed in 2 different directories, but 
**the one that needs to be run with node is gtp2ogs.js in node_modules directory**

### 3. Optional : install any missing node.js packages
 
**This step can be skipped**

you may need to install extra tools if the 
[Most common usage](https://github.com/wonderingabout/gtp2ogs/blob/clearer-devel/README.md#5-most-common-usage--start-gtp2ogsjs-using-nodejs) below fails, such as (run as `sudo` for linux, and as admin for windows)
 
```
npm install -g socket.io-client
npm install -g optimist
npm install -g tracer
  ```

### 4. Recommended : Upgrade to devel branch

This step is **is recommended**

By default, npm installs an old branch of gtp2ogs that does not include latest improvements, 
new features, and fixes

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
pushd C:\Program Files\nodejs && node.exe C:\Users\yourwindowsusername\AppData\Roaming\npm\node_modules\gtp2ogs\gtp2ogs.js --username <yourbotusername> --apikey <apikey> <gtp2ogsargument1> <gtp2ogsargument2> -- C:\Users\path\to\your\ai\executable.exe <botargument1> <botargument2>
```

note : for all operating systems, in ` -- `, the spaces after `<gtp2ogsarguments>` 
and before `/path/to/your/bot.executable` are important : they separate gtp2ogs 
arguments from your bot arguments

note 2 : the number of <gtp2ogsarguments> and <botarguments> is not limited, 
here only 2 were shown but it possible to use for example 3,4,5 , or as many as you want
  
note 3 : to play on [beta OGS server](https://beta.online-go.com/) instead of the 
[OGS server](https://online-go.com/), add the `-- beta` argument

### Extra : add features by editing gtp2ogs.js file

This step is totally not needed but can be much appreciated

To do that, programming knowledge is needed (or you can ask for help)

For example you can program the gtp2ogs.js so that it sends winrate and 
playouts/visits information at every move, or even clickable variations, 
such as what [some bots](https://online-go.com/game/15926249) use for example.

# Options

Before putting `<gtp2ogsarguments>`, you have to put these options first :

  ```--username``` Specify the username of the bot, for example `--username GnuGo`, currently 
there is no profile number log in support on ogs, see [notes A-](/README.md#a-) for details

  ```--apikey``` Specify the API key for the bot, for example `--apikey 5srvb5es4se7651741r61devr864re`

Then, the following options are placed in the above ```<gtp2ogsarguments>``` section. 
Put a space in between options when there are more than one.  Also put a space in between
 the option and the parameter like:

  ```--startupbuffer 2 --boardsize 13,19 --ban UserX,playerY ```

  ```--host```  OGS Host to connect to (default online-go.com)

  ```--port``` OGS Port to connect to (default 443)

  ```--timeout``` Disconnect from a game after this many seconds (if set) (default 0)

  ```--insecure```  Don't use ssl to connect to the ggs/rest servers

  ```--beta```  Connect to the [beta server](https://beta.online-go.com/) instead of 
[OGS](https://online-go.com/) (sets ggs/rest hosts to the beta server)

  ```--debug``` or ```-d```  Output GTP command and responses from your Go engine

  ```--logfile``` or ```-l``` In addition to logging to the console, also log gtp2ogs 
  output to a text file

  ```--json``` or ```-j```  Send and receive GTP commands in a JSON encoded format

  ```--kgstime```  Set this if bot understands the kgs-time_settings command

  ```--noclock```  Do not send any clock/time data to the bot

  ```--persist```  Bot process remains running between moves

  ```--corrqueue``` or ```-cq``` Process correspondence games one at a time

  ```--maxtotalgames``` or ```-mt``` Maximum number of total games, maxtotalgames is actually 
the maximum total number of connected games for your bot (correspondence games are currently included in 
the connected games count if you use `--persist` ) , which means the maximum number of games your bot 
can play at the same time (choose a low number to regulate your GPU use)

  ```--maxactivegames``` or ```-ma``` Maximum number of active games per player against this bot

  ```--startupbuffer``` Subtract this many seconds from time available on first move (default 5)

  ```--rejectnew``` or ```-r``` Reject all new challenges with the default reject message

  ```--rejectnew --rejectnewmsg "not accepting games because blablablah"``` or ```-r -rm "not accepting games because blablablah"``` if you add the rejectnewmsg argument, Reject all new challenges with a customized message 
instead of the default message. This message has to be included in "not accepting games because blablablah" 
(for example to explain why, for how long, if your bot is busy playing a tournament, etc...)

  ```--rejectnewfile ~/rejectnew.status```  Reject new challenges if file exists (checked each time, 
can use for load-balancing)

  ```--boardsize``` or ```-bb``` Possible boardsize values `all` (allows ALL boardsizes, use only if 
your bot can handle it !), `custom` (allows specified custom boardsize (for example 25x1, 9x9, 17x2 , 
15x15, 3x2, etc..), and square board size written in numbers comma separated (for example 9x9, 13x13, 
19x19, default is `9,13,19`), see [notes E-](/README.md#e-) for details

  ```--boardsize custom --boardsizewidth 25 --boardsizeheight 1,2,3``` or ```-bb custom -bw 25 -bh 1,2,3``` 
Allows custom board size (if your bot can handle it), it is needed to use `custom` followed by 
comma separated value(s), in this example 25x1 25x2 25x3 are all allowed boardsizes, 
see [notes E-](/README.md#e-) for details

  ```--komi``` Possible komi values `auto` (allows Automatic komi), `all` (allows all komi values), 
and for example `7.5` (allows komi value 7.5). When `all` is used alone, all komi values are allowed. 
When an argument other than `all` is used, only the chosen argument komi values are allowed and 
all other komi values are rejected see [notes C-](/README.md#c-) and [notes D-](/README.md#d-) for details

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

  ```--greeting "Hello, have a nice game"```  Greeting message to appear in chat at first move 
(ex: "Hello, have a nice game")

  ```--farewell "Thank you for playing"```  Thank you message to appear in chat at end of game 
(ex: "Thank you for playing")

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

  ```--hidden``` or ```-h``` Hides the botname from the OGS game "Play against computer" bot list 
(but it can still accept challenges)

After that, add a ``` -- ``` (with one space before and one space after the `--` ), to 
separate `<gtp2ogsarguments>` from your bot path and `<botarguments>`, as shown in 
[Most common usage earlier](/README.md#5-most-common-usage--start-gtp2ogsjs-using-nodejs)

## notes :

#### A : 

Currently, ogs does not support profile id number authentification, so you have to use bot 
username only. For example, for this famous bot https://online-go.com/player/58441/GnuGo , 
you have to use the bot name `GnuGo` and currently you cannot use profile number `58441` 
(it will not work)

Therefore, the old `id` aliases (`id` , `botid` , `bot`), that still required names and not 
id numbers, contrary to what this line was suggesting `Jan 23 17:18:13   #  Bot is user id: 58441`) 
that added confusion to how to use gtp2ogs for bot admins have been removed

To sum up, to connect your bot on OGS, you need and you have to simply use bot name, 
for example `--username GnuGo` for the bot admin of GnuGo

#### B : 

a list of gtp2ogs arguments is also available 
[here](https://github.com/online-go/gtp2ogs/blob/devel/gtp2ogs.js) (ctrl+f "describe")

#### C : 

on OGS, black player will always get the handicap stones regardless of rank difference 
(if auto (automatic) komi is selected, the komi will be 0.5) 

but you can restrict allowed komi for example to only 7.5 or auto with `--komi 7.5,auto`

or only 7.5 komi with `--komi 7.5` to play handicap games with 7.5 komi, if your bot 
does not support 0.5 komi value.

#### D :

explanation on how to use komi argument:

- `--komi auto,0.5,7.5` for example, will allow any of these komi values : 
automatic(auto), 0.5, or 7.5, and will reject any other value

- another example `--komi 7.5` will only accept komi value 7.5 and will reject any other value. 
In that example, note that if `auto` (automatic) komi happens to have the value 7.5, 
the auto value will be set to 7.5 and will be accepted and game will start (bots will always 
replace any rules with chinese rules, so a non handicap game 19x19 on ogs against a bot will 
always have the komi 7.5)

- the `--komi 7.5` can be useful if your bot handles handicap well, but only with the value 7.5 
for example (and not 0.5)

#### E : 

aliases :
- whenever `--boardsize` is usued, you can shorten it with just `-bb`
- whenever `--boardsizewidth` is usued, you can shorten it with just `-bw`
- whenever `--boardsizeheight` is usued, you can shorten it with just `-bh`

example : `--boardsize 19` or `--boardsize 9,19` (most common sizes : 19x19 and 9x9) 
or `-bb 19`

or `--boardsize all` (if you made some fancy bot)
    
if you want to use a "custom" board size, you need to specify wanted custom width(s) 
and height(s) desired

for example : `--boardsize custom --boardsizewidth 25 --boardsizeheight 1` will allow only 
25x1 board size

or another example `--boardsize custom --boardsizewidth 9,10,11 --boardsizeheight 9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25` 
will allow all possible combinations of width and height here (there 3 multiplied by 
17 possible combinations here, which is 51 possible board sizes !

finally, it is possible to play "official" boardsizes too with this setting, 
for example `--boardsize custom --boardsizewidth 9 --boardsizeheight 9,19` will 
allow 9x9 and 9x19 board sizes

#### F : 

when using the "msg" arguments (`--greeting` , `--farewell` , `--rejectnew --rejectnewmsg` , 
some special characters will make gtp2ogs crash, such as `!!` (two times `!`) , 
so test special characters in your messages with caution 

these special characters have been tested to work on messages, among others :  `!` 
(one time `!`) , `?` , `,` , `(` , `)` , `:` , `;` 

#### G : 

for some `gtp2ogsarguments`, it is possible to use a shorter version of the argument to 
write faster and with less command length, it is also called "aliases"

Here are the currently available aliases on gtp2ogs :

- `--debug`, `-d`
- `--logfile`, `-l`
- `--json`, `-j`
- `--hidden`, `-h`
- `--rejectnew`, `-r`
- `--rejectnewmsg`, `-rm`
- `--maxtotalgames`, `-mt`
- `--maxactivegames`, `-ma`
- `--corrqueue`, `-cq`
- `--boardsize`, `-bb`
- `--boardsizewidth`, `-bw`
- `--boardsizeheight`, `-bh`

When you use these aliases one `-` is enough, you don't need to do `--`

# Discord chat : 

if you're read that far, maybe you'll be interested to share your bot experience with 
bot admins or see talked topic !

come on the leela zero discord in `#bots` channel and follow the talk with everyone !

https://discord.gg/HZ23Cp9

This discord can also be useful if you want to have fast and quick, interactive chat !

You can also use the discord to ask simple and quick questions

However, if you have a problem and it needs some explanations and time, it is common 
github practices to uses the ["Issues](https://github.com/online-go/gtp2ogs/issues) 
forum instead

# Contributing

You like gtp2ogs and want to improve it ?

found a bugfix ?

want to add a new feature ?

Welcome !

come help us all make gtp2ogs more awesome than it already is ! 

Read Contributing instructions [here](/CONTRIBUTING.md)

