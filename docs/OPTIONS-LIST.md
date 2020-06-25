# Options list

Below is a list of all available options.

In gtp2ogs, options need to be inputted as command-line arguments.

The number of options (and of bot arguments) is free, use the
 ones you want.

## DEFAULT VALUES SUMMARY

Also, some options come provided with a default, so even if
you don't input any value, it will work as-is

However, you can also use your own value if you want: this will
overwrite the default one

For easier reference, you can see below all default values gtp2ogs
currently provides:

```Text
--host online-go.com
--port 443
--startupbuffer 5
--timeout 0
--maxconnectedgames 20
--maxconnectedgamesperuser 3
--rejectnewmsg "Currently, this bot is not accepting games, try again later "
--boardsizes 9,13,19
--komis automatic
--speeds all
--timecontrols fischer,byoyomi,simple,canadian
--minmaintimeblitz 15
--maxmaintimeblitz 300
--minmaintimelive 60
--maxmaintimelive 7200
--minmaintimecorr 259200
--maxmaintimecorr 604800
--minperiodsblitz 3
--maxperiodsblitz 20
--minperiodslive 3
--maxperiodslive 20
--minperiodscorr 3
--maxperiodscorr 10
--minperiodtimeblitz 5
--maxperiodtimeblitz 10
--minperiodtimelive 10
--maxperiodtimelive 120
--minperiodtimecorr 14400
--maxperiodtimecorr 259200
```

note: command-line arguments should not be separated by skipping
lines, it was done here only for clearer display.

note2: additional details are also available [here](/docs/NOTES.md).

## 1) ROOT OPTIONS

Options in this category work the same way no matter what
the ranked/unranked status is.

Note: about the "messages" options, some combinations of
characters in messages make gtp2ogs crash !!
see for details [notes G](/docs/NOTES.md#g)

### username

`--username` Specify the username of the bot, for example
`--username GnuGo`

### apikey

`--apikey` Specify the API key for the bot, for example
`--apikey 5srvb5es4se7651741r61devr864re`

note: in debug, the apikey is replaced with a "hidden" for
security reasons

### greeting

`--greeting "Hello, have a nice game"`
Greeting message to appear in chat at first move
(ex: Hello, have a nice game)

see for details [notes G](/docs/NOTES.md#g)

### greetingbotcommand

`--greetingbotcommand` Additional greeting message displaying
bot command

for example:

```Text
You are playing against: sai-0.17.5.exe --gtp -w saiNetwork337.gz --noponder -v 12800 -r 2 --precision half --lagbuffer 1000 --nrsymm --lambda 0.5
```

This gives valuable information to the users who desire it.

And due to its nature, this supports all bots.

You may rename your bot command files and arguments to be self-explanatory,
for example:

- `saiNetwork337.gz` is shorter than `6470f77e4768bef4ef85641c04a0e3a068cf097c760b4a9c1b9c4d58b304b031.gz`
(you may want to trim it), and clearer than `network.gz`
- `sai-0.17.5.exe` or `sai-fb36e42.exe` is clearer than `sai.exe`.

### farewell

`--farewell "Thank you for playing"`
Thank you message to appear in chat at end of game
(ex: Thank you for playing)

see for details [notes G](/docs/NOTES.md#g)

### farewellscore

`--farewellscore`
Asks the bot for the score using `final_score` and sends it to the chat
if the game ended by passing.
The command is sent regardless of whether the game ends by passing or
by resignation, to allow bots to process the end of the game and (e.g.)
save it locally.

### rejectnew options

`--rejectnew` Reject all new challenges with the default
reject message

`--rejectnew --rejectnewmsg "not accepting games because blablablah"`
if you add the rejectnewmsg option, Reject all new challenges with a
customized message instead of the default message.

see for details [notes G](/docs/NOTES.md#g)

`--rejectnewfile ~/rejectnew.status` Reject new challenges if
file exists (checked each time, can use for load-balancing)

### debug

`--debug`  Output GTP command and responses from your Go engine

### ogspv

`--ogspv` Send winrate and variations for supported AIs with
supported settings

Example of output (Leela Zero):

```Text
Variation: Winrate: 57.93%, Visits: 19821, Playouts: 19820
```

see a live example in: <https://online-go.com/game/23008077>

Supported AIs:

- `LeelaZero` (<https://zero.sjeng.org/>)
- `Sai` (<http://sai.unich.it/>)
- `KataGo` (<https://github.com/lightvector/KataGo>)
- `PhoenixGo` (<https://github.com/Tencent/PhoenixGo>)
- `Leela` (<https://sjeng.org/leela.html>)

for example `--ogspv LeelaZero`

**IMPORTANT: see [notes H](/docs/NOTES.md#h) for details**

### aichat

`--aichat` Allow bots to send messages to the chat and malkovich log.

Bots should output messages to standard error output in the format:

```Text
DISCUSSION: What an interesting move you played!
MALKOVICH: Let him think on that for a bit, clearly BA1 kills him here.
```

### logfile

`--logfile` In addition to logging to the console, also log gtp2ogs
output to a text file. Filename argument is optional (using only `--logfile`
will use default filename, for example `gtp2ogs_logfile_2020-05-21T21:40:22.910Z`)

### json

`--json`  Send and receive GTP commands in a JSON encoded format

### beta

`--beta`  Connect to the [beta server](https://beta.online-go.com/)
instead of [OGS](https://online-go.com/) (changes host automatically)

### host

`--host` OGS Host to connect to

### port

`--port` OGS Port to connect to

### insecure

`--insecure`  Do not use ssl to connect to the ggs/rest servers

### hidden

`--hidden` Hides the botname from the OGS game "Play against
 computer" bot list (but it can still accept challenges)

### startupbuffer

`--startupbuffer` Subtract this many seconds from time
available on first move (if set)

### timeout

`--timeout` Disconnect from a game after this many seconds (if set)

### kgstime

`--kgstime`  Set this if bot understands the kgs-time_settings command

### showboard

`--showboard`  Set this if bot understands the showboard
GTP command, and if you want to display the showboard output

- This breaks some bots which dont support it (ex: PhoenixGo)
- And this makes the log much bigger, so may not be desired even
if supported

So default is disabled

### persist

`--persist`  Bot process remains running between moves

### noclock

`--noclock` Do not send any clock/time data to the bot

### corrqueue

`--corrqueue` Process correspondence games one at a time

### maxconnectedgames

`--maxconnectedgames` Maximum number of connected games
for all users against your bot (correspondence games are currently
included in the connected games count, see
[#59](https://github.com/online-go/gtp2ogs/issues/59) for details),
which means the maximum number of games your bot can play at the
same time (choose a low number to regulate your computer performance
and stability)

### maxconnectedgamesperuser

`--maxconnectedgamesperuser` Maximum number of
connected games per user against this bot

### rankedonly unrankedonly

`--rankedonly` Only accept ranked matches

`--unrankedonly`  Only accept unranked matches

## 2) OPTIONS TO CHECK RANKED/UNRANKED CHALLENGES

Options in this category allow us to accept or reject
a challenge based on the notification (challenge settings)

### 2A) ALL/RANKED/UNRANKED

Here the general option (ex: bans) does not confict with
the ranked and unranked options for accepting/rejecting matches.

example:
`--bans A,B --bansranked X,Y --bansunranked Z`

result of these bans arguments:

- banned users for ranked games: A,B,X,Y
- banned users for unranked games: A,B,Z

#### bans

`--bans` Comma separated list of user names or IDs who
are banned from ranked and unranked games

`--bansranked` Comma separated list of user names or IDs who
are banned from ranked games

`--bansunranked` Comma separated list of user names or IDs who
are banned from unranked games

### 2B) GENERAL/RANKED/UNRANKED

Here you can either use:

- only the general option (ex: `--maxhandicap 2`), the same setting
will be used for ranked and unranked games

- OR both the ranked AND the unranked option
(ex: `--maxhandicapranked 0 --maxhandicapunranked 9`),
and in that case, the general option will be ignored
and instead the ranked and unranked will be used depending
on whether the game is ranked or unranked.

### 2B1) ALLOWED GROUP

For the allowed groups arguments, you can either use the value:

- `all`: will allow ALL possible values
- for text-only groups (ex: speeds ("blitz", "fischer", "white", etc.)),
comma-separated values (without space) will allow every value inputted,
every other value will be rejected
- for numbers groups +/- text groups (ex: komis contain comma-separated numbers
(5.5,6.5,7.5) or text ("automatic"), (ex: boardsizes contain only comma-separated
numbers (9,13,19).

example: `--speeds blitz,live`
example 2: `--speedsranked live,correspondence --speedsunranked blitz,live`
example 3: `--komis 0.5,5.5,7.5,automatic`

#### boardsizes

`--boardsizes` Board size(s) to accept

`--boardsizesranked` Board size(s) to accept for ranked games

`--boardsizesunranked` Board size(s) to accept for unranked games

Possible boardsize width value(s):

- `all` (allows all board sizes)
- comma separated and `:` separated values, for example
 `25` (allows 25x25), or `9,13,15:17,19` (allows
 9x9, 13x13, 15x15, 16x16, 17x17, 19x19)

note: it is possible to allow non-square boardsizes by using `all`
 (which will allow possible boardsizes)

see [notes B](/docs/NOTES.md#b) for details:

#### komis

`--komis` Allowed komi values

`--komisranked` Allowed komi values for ranked games

`--komisunranked` Allowed komi values for unranked games

Possible komi value(s):

- `all` (allows all komis)
- comma separated and `:` separated values,
 for example `7.5` (allows komi 7.5), or `5.5:7.5,0.5,automatic` allows komis
 (5.5, 6.5, 7.5, 0.5, automatic), or `-2:3:0.5` (allows komis
 (-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3).

For extra komi explanations, see:

- [notes C](/docs/NOTES.md#c)
- [notes D](/docs/NOTES.md#d)

#### speeds

`--speeds` Comma separated list of Game speed(s) to accept

`--speedsranked` Comma separated list of Game speed(s) to
accept for ranked games

`--speedsunranked` Comma separated list of Game speed(s) to
accept for unranked games

Possible speed value(s):

- `all` (allows all speeds)
- comma separated values, for example `blitz`, or `live, correspondence`

Full list of possible values:  `blitz`,  `live`, `correspondence`.

#### timecontrols

`--timecontrols` Time control(s) to accept

`--timecontrolsranked` Time control(s) to accept for ranked
games

`--timecontrolsunranked` Time control(s) to accept for unranked
games

Possible timecontrol value(s):

- `all` (allows all timecontrols)
- comma separated values, for example `byoyomi`, or `fischer, byoyomi, simple`

Full list of possible values:  `fischer`,  `byoyomi`, `canadian`,
`simple`, `absolute`, `none`.

see [notes E](/docs/NOTES.md#e) for details

### 2B2) GENERIC GENERAL/RANKED/UNRANKED OPTIONS

Arguments in this category are not comma-separated, they are either
booleans (enabled just from enabling the option, nothing else to specify,
for example `--noautohandicap`), or single values (for example `--maxhandicap 9`)

#### proonly

`--proonly` For all games, only accept those from professionals

`--proonlyranked` For ranked games, only accept those from professionals

`--proonlyunranked` For unranked games, only accept those from professionals

#### nopause

`--nopause`  Disable pausing during games

`--nopauseranked` Disable pausing during ranked games

`--nopauseunranked` Disable pausing during unranked games

#### nopauseonweekends

note: this setting has no effect on pausing DURING games, here
we only accept or reject a match if it comes with the setting
"Pause on week-ends" (specific to correspondence games)

`--nopauseonweekends`  Do not accept matches that come with the
option -pauses on weekends- (specific to correspondence games)

`--nopauseonweekendsranked` Do not accept ranked matches that come
with the option -pauses on weekends- (specific to correspondence games)

`--nopauseonweekendsunranked` Do not accept unranked matches that
come with the option -pauses on weekends- (specific to correspondence games)

#### noautohandicap

`--noautohandicap` Do not allow handicap to be set to -automatic-

`--noautohandicapranked` Do not allow handicap to be set to
-automatic- for ranked games

`--noautohandicapunranked` Do not allow handicap to be set to
-automatic- for unranked games

**important note**: see [notes F](/docs/NOTES.md#f) for details

#### min/max handicap

min:

`--minhandicap`  Minimum handicap to accept

`--minhandicapranked`  Mininimum handicap to accept for ranked games

`--minhandicapunranked` Minimum handicap to accept for unranked games

max:

`--maxhandicap`  Maximum handicap to accept for all games

`--maxhandicapranked` Maximum handicap to accept for ranked games

`--maxhandicapunranked` Maximum handicap to accept for unranked games

**important note**: see [notes F](/docs/NOTES.md#f) for details

#### min/max rank

min:

`--minrank` Minimum opponent rank to accept (e.g. 15k)

`--minrankranked` Minimum opponent rank to accept for
ranked games (e.g. 15k)

`--minrankunranked` Minimum opponent rank to accept for
unranked games (e.g. 15k)

max:

`--maxrank` Maximum opponent rank to accept (e.g. 1d)

`--maxrankranked` Maximum opponent rank to accept for
ranked games (e.g. 1d)

`--maxrankunranked` Maximum opponent rank to accept for
unranked games (e.g. 1d)

#### min/max maintime blitz/live/corr

min:

`--minmaintimeblitz` Minimum seconds of main time for
blitz games (default 15 , which is 15 seconds)

`--minmaintimeblitzranked` Minimum seconds of main time for
blitz ranked games

`--minmaintimeblitzunranked` Minimum seconds of main time
for blitz unranked games

`--minmaintimelive` Minimum seconds of main time for
live games (default 30 , which is 30 seconds)

`--minmaintimeliveranked` Minimum seconds of main time for
live ranked games

`--minmaintimeliveunranked` Minimum seconds of main time
for live unranked games

`--minmaintimecorr` Minimum seconds of main time for
correspondence games (default 259200 , which is 3 days)

`--minmaintimecorrranked` Minimum seconds of main time for
correspondence ranked games

`--minmaintimecorrunranked` Minimum seconds of main time
for correspondence unranked games

max:

`--maxmaintimeblitz` Maximum seconds of main time for
blitz games (default 300, which is 5 minutes)

`--maxmaintimeblitzranked` Maximum seconds of main time for
blitz ranked games

`--maxmaintimeblitzunranked` Maximum seconds of main time for
blitz unranked games

`--maxmaintimelive` Maximum seconds of main time for
live games (default 7200, which is 2 hours)

`--maxmaintimeliveranked` Maximum seconds of main time for
live ranked games

`--maxmaintimeliveunranked` Maximum seconds of main time for
live unranked games

`--maxmaintimecorr` Maximum seconds of main time for
correspondence games (default 604800, which is 7 days)

`--maxmaintimecorrranked` Maximum seconds of main time for
correspondence ranked games

`--maxmaintimecorrunranked` Maximum seconds of main time for
correspondence unranked games

#### min/max periods blitz/live/corr

min:

`--minperiodsblitz` Minimum number of periods for
blitz games

`--minperiodsblitzranked` Minimum number of periods
for blitz ranked games

`--minperiodsblitzunranked` Minimum number of periods
for blitz unranked games

`--minperiodslive` Minimum number of periods for
live games

`--minperiodsliveranked` Minimum number of periods
for live ranked games

`--minperiodsliveunranked` Minimum number of periods
for live unranked games

`--minperiodscorr` Minimum number of periods for
correspondence games

`--minperiodscorrranked` Minimum number of periods
for correspondence ranked games

`--minperiodscorrunranked` Minimum number of periods
for correspondence unranked games

max:

`--maxperiodsblitz` Maximum number of periods for
blitz games

`--maxperiodsblitzranked` Maximum number of periods
for blitz ranked games

`--maxperiodsblitzunranked` Maximum number of periods
for blitz unranked games

`--maxperiodslive` Maximum number of periods for
live games

`--maxperiodsliveranked` Maximum number of periods
for live ranked games

`--maxperiodsliveunranked` Maximum number of periods
for live unranked games

`--maxperiodscorr` Maximum number of periods for
correspondence games

`--maxperiodscorrranked` Maximum number of periods
for correspondence ranked games

`--maxperiodscorrunranked` Maximum number of periods
for correspondence unranked games

#### min/max periodtime blitz/live/corr

For period times below, if timecontrol is canadian, divide the
wanted period time for all the stones by the number of stones per period,

for example max periodtime
5 minutes / 25 stones = 5*60 /25 = maxperiodtime = 12 (seconds)

min:

`--minperiodtimeblitz` Minimum seconds per period
(average time per stone if timecontrol is canadian) for blitz games
(default 5 , which is 5 seconds)

`--minperiodtimeblitzranked` Minimum seconds per period
(average time per stone if timecontrol is canadian) for blitz ranked games

`--minperiodtimeblitzunranked` Minimum seconds per period
(average time per stone if timecontrol is canadian) for blitz unranked games

`--minperiodtimelive` Minimum seconds per period
(average time per stone if timecontrol is canadian) for live games
(default 10 , which is 10 seconds)

  `--minperiodtimeliveranked` Minimum seconds per period
(average time per stone if timecontrol is canadian) for live ranked games

  `--minperiodtimeliveunranked` Minimum seconds per period
(average time per stone if timecontrol is canadian) for live unranked games

`--minperiodtimecorr` Minimum seconds per period
(average time per stone if timecontrol is canadian) for correspondence games
(default 14400 , which is 4 hours)

`--minperiodtimecorrranked` Minimum seconds per period
(average time per stone if timecontrol is canadian) for correspondence ranked games

`--minperiodtimecorrunranked` Minimum seconds per period
(average time per stone if timecontrol is canadian) for correspondence unranked games

max:

`--maxperiodtimeblitz` Maximum seconds per period
(average time per stone if timecontrol is canadian) for blitz games
(default 10 , which is 10 seconds)

`--maxperiodtimeblitzranked` Maximum seconds per period
(average time per stone if timecontrol is canadian) for blitz ranked games

`--maxperiodtimeblitzunranked` Maximum seconds per period
(average time per stone if timecontrol is canadian) for blitz unranked games

`--maxperiodtimelive` Maximum seconds per period
(average time per stone if timecontrol is canadian) for live games
(default 120 , which is 2 minutes)

`--maxperiodtimeliveranked` Maximum seconds per period
(average time per stone if timecontrol is canadian) for live ranked games

`--maxperiodtimeliveunranked` Maximum seconds per period
(average time per stone if timecontrol is canadian) for live unranked games

`--maxperiodtimecorr` Maximum seconds per period
(average time per stone if timecontrol is canadian) for correspondence games
(default 259200 , which is 3 days)

`--maxperiodtimecorrranked` Maximum seconds per period
(average time per stone if timecontrol is canadian) for correspondence ranked games

`--maxperiodtimecorrunranked` Maximum seconds per period
(average time per stone if timecontrol is canadian) for correspondence unranked games
