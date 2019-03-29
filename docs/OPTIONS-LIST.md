below is a list of all possible to use gtp2ogs arguments, 

Since they take a lot of place all the list has been moved here

use the ones you want only, no need to use them all !

The options below are clickable links, so that you can share the 
link to the wanted option :

#### host
```--host``` OGS Host to connect to (default online-go.com)

#### port
```--port``` OGS Port to connect to (default 443)

#### timeout
```--timeout``` Disconnect from a game after this many seconds (if set) 
(default 0)

#### insecure
```--insecure```  Don't use ssl to connect to the ggs/rest servers

#### beta
```--beta```  Connect to the [beta server](https://beta.online-go.com/) 
instead of [OGS](https://online-go.com/) (sets ggs/rest hosts to the 
beta server)

#### debug
```--debug```  Output GTP command and responses from your Go engine

#### logfile
```--logfile``` In addition to logging to the console, also log gtp2ogs 
output to a text file

#### json
```--json```  Send and receive GTP commands in a JSON encoded format

#### kgstime
  ```--kgstime```  Set this if bot understands the kgs-time_settings command

#### showboard
  ```--showboard```  Set this if bot understands the showboard GTP command, 
and if you want to display the showboard output

- This breaks some bots which dont support it 
- And this makes the log much bigger, so may not be desired even if supported

So default is disabled

#### noclock
  ```--noclock``` Do not send any clock/time data to the bot

#### persist
  ```--persist```  Bot process remains running between moves

#### corrqueue
  ```--corrqueue``` Process correspondence games one at a time

#### maxconnectedgames
  ```--maxconnectedgames``` Maximum number of connected games 
for all users against your bot (correspondence games are currently included in 
the connected games count, see [#59](https://github.com/online-go/gtp2ogs/issues/59) 
for details) , which means the maximum number of games your bot can play at the 
same time (choose a low number to regulate your computer performance and 
stability) (default 20)

#### maxconnectedgamesperuser
  ```--maxconnectedgamesperuser``` Maximum number of 
connected games per user against this bot (default 3)

#### startupbuffer
  ```--startupbuffer``` Subtract this many seconds from time 
available on first move (default 5)

#### rejectnew
  ```--rejectnew``` Reject all new challenges with the default 
reject message

  ```--rejectnew --rejectnewmsg "not accepting games because blablablah"``` 
if you add the rejectnewmsg argument, Reject all new challenges with a customized 
message instead of the default message. This message has to be included in 
"not accepting games because blablablah" (for example to explain why, for how long, 
if your bot is busy playing a tournament, etc...)

#### rejectnewfile
  ```--rejectnewfile ~/rejectnew.status``` Reject new challenges if 
file exists (checked each time, can use for load-balancing)

#### bans
  ```--bans``` Comma separated list of user names or IDs 
(e.g.  UserA,UserB,UserC  do not put spaces in between)

  ```--bansranked``` Comma separated list of user names or IDs who 
are banned from ranked games

  ```--bansunranked``` Comma separated list of user names or IDs who 
are banned from unranked games

The "bans" arguments are an exception to the general rule of using only general 
argument alone, or specific ranked/unranked instead :

Because, since bans is a string, we allow both general value `--bans A,B` AND 
specific values at the same time too `--bansranked X,Y --bansunranked Z`, the 
result will be Players banned : 

- for ranked games : A,B,X,Y
- for unranked games : A,B,Z 

#### boardsizes
  ```--boardsizes``` Board size(s) to accept

  ```--boardsizesranked``` Board size(s) to accept for ranked games

  ```--boardsizesunranked``` Board size(s) to accept for unranked games

Possible boardsizes values :

- `all` (allows ALL boardsizes, use only if your bot can handle it !), 
- `custom` (allows specified custom boardsize (for example 25x1, 9x9, 17x2 , 
15x15, 3x2, etc..), 
- or square boardsizes written in numbers comma separated (default is `9,13,19` 
which is 9x9, 13x13, 19x19), see [notes E-](/docs/docs/NOTES.md#e-) for details

#### boardsizes custom
if ```--boardsizes custom``` is chosen, then you need to specify these new 
options as well :

  ```--boardsizewidths``` For custom board sizes, specify boardsize width(s) 
to accept, for example 25

  ```--boardsizewidthsranked``` For custom board sizes, specify boardsize 
width(s) to accept for ranked games, for example 25

  ```--boardsizewidthsunranked``` For custom board sizes, specify boardsize 
width(s) to accept for unranked games, for example 25

  ```--boardsizeheights``` For custom board sizes, specify boardsize height(s) 
to accept, for example 1,2,3

  ```--boardsizeheightsranked``` For custom board sizes, specify boardsize 
height(s) to accept for ranked games, for example 1,2,3

  ```--boardsizeheightsunranked``` For custom board sizes, specify boardsize 
height(s) to accept, for example 1,2,3

for example :

  ```--boardsizes custom --boardsizewidths 25 --boardsizeheights 1,2,3``` 
Allows custom board sizes 25x1 25x2 25x3 in that example, see 
[notes E-](/docs/docs/NOTES.md#e-) for details

#### komis
```--komis``` Allowed komi values  (default automatic)

```--komisranked``` Allowed komi values for ranked games

```--komisunranked``` Allowed komi values for unranked games
 
Possible komi values : 
- `automatic` (allows automatic komi), 
- `all` (allows all komi values), When `all` is used alone, all 
komi values are allowed. 
- comma separated values, for example `7.5`, or `7.5,6.5,0.5,automatic` 

When an argument other than `all` is used, only the chosen argument komi 
values are allowed and all other komi values are rejected see 
[notes C-](/docs/docs/NOTES.md#c-) and [notes D-](/docs/docs/NOTES.md#d-) 
for details

#### speeds
  ```--speeds``` Comma separated list of Game speed(s) to accept 
(default blitz,live,correspondence)

  ```--speedsranked``` Comma separated list of Game speed(s) to 
accept for ranked games

  ```--speedsunranked``` Comma separated list of Game speed(s) to 
accept for unranked games

#### timecontrols
  ```--timecontrols``` Time control(s) to accept (default fischer,
byoyomi,simple,canadian)

  ```--timecontrolsranked``` Time control(s) to accept for ranked 
games

  ```--timecontrolsunranked``` Time control(s) to accept for unranked 
games

note : "absolute" and/or "none" can be manually allowed by bot 
admin in timecontrol if want, but then : 

- for absolute games : make sure you increase `--minmaintime/blitz*live*corr` 
a lot higher than default (with current defaults, bot will timeout 
in just a few moves)
- for "none" : games would be very very long

#### minmaintime
  ```--minmaintimeblitz``` Minimum seconds of main time for 
blitz games (default 15 , which is 15 seconds)

  ```--minmaintimeblitzranked``` Minimum seconds of main time for 
blitz ranked games 

  ```--minmaintimeblitzunranked``` Minimum seconds of main time 
for blitz unranked games 

  ```--minmaintimelive``` Minimum seconds of main time for 
live games (default 30 , which is 30 seconds)

  ```--minmaintimeliveranked``` Minimum seconds of main time for 
live ranked games 

  ```--minmaintimeliveunranked``` Minimum seconds of main time 
for live unranked games 

  ```--minmaintimecorr``` Minimum seconds of main time for 
correspondence games (default 259200 , which is 3 days)

  ```--minmaintimecorrranked``` Minimum seconds of main time for 
correspondence ranked games 

 ```--minmaintimecorrunranked``` Minimum seconds of main time 
for correspondence unranked games 

#### maxmaintime
  ```--maxmaintimeblitz``` Maximum seconds of main time for 
blitz games (default 300, which is 5 minutes)

  ```--maxmaintimeblitzranked``` Maximum seconds of main time for 
blitz ranked games 

  ```--maxmaintimeblitzunranked``` Maximum seconds of main time for 
blitz unranked games 

  ```--maxmaintimelive``` Maximum seconds of main time for 
live games (default 7200, which is 2 hours)

  ```--maxmaintimeliveranked``` Maximum seconds of main time for 
live ranked games 

 ```--maxmaintimeliveunranked``` Maximum seconds of main time for 
live unranked games 

  ```--maxmaintimecorr``` Maximum seconds of main time for 
correspondence games (default 604800, which is 7 days)

  ```--maxmaintimecorrranked``` Maximum seconds of main time for 
correspondence ranked games 

  ```--maxmaintimecorrunranked``` Maximum seconds of main time for 
correspondence unranked games 

#### minperiods
  ```--minperiodsblitz``` Minimum number of periods for 
blitz games (default 3)

  ```--minperiodsblitzranked``` Minimum number of periods 
for blitz ranked games

  ```--minperiodsblitzunranked``` Minimum number of periods 
for blitz unranked games

  ```--minperiodslive``` Minimum number of periods for 
live games (default 3)

  ```--minperiodsliveranked``` Minimum number of periods 
for live ranked games

  ```--minperiodsliveunranked``` Minimum number of periods 
for live unranked games

  ```--minperiodscorr``` Minimum number of periods for 
correspondence games (default 3)

  ```--minperiodscorrranked``` Minimum number of periods 
for correspondence ranked games

  ```--minperiodscorrunranked``` Minimum number of periods 
for correspondence unranked games

#### maxperiods
  ```--maxperiodsblitz``` Maximum number of periods for 
blitz games (default 20)

  ```--maxperiodsblitzranked``` Maximum number of periods 
for blitz ranked games

  ```--maxperiodsblitzunranked``` Maximum number of periods 
for blitz unranked games

  ```--maxperiodslive``` Maximum number of periods for 
live games (default 20)

  ```--maxperiodsliveranked``` Maximum number of periods 
for live ranked games

  ```--maxperiodsliveunranked``` Maximum number of periods 
for live unranked games

  ```--maxperiodscorr``` Maximum number of periods for 
correspondence games (default 10)

  ```--maxperiodscorrranked``` Maximum number of periods 
for correspondence ranked games

  ```--maxperiodscorrunranked``` Maximum number of periods 
for correspondence unranked games

#### minperiodtime
 For period times below, if timecontrol is canadian, divide the period 
time by the number of stones per period, 

for example max periodtime 
5 minutes / 25 stones = 5*60 /25 = maxperiodtime = 12 

  ```--minperiodtimeblitz``` Minimum seconds per period 
(average time per stone if timecontrol is canadian) for blitz games 
(default 5 , which is 5 seconds)

  ```--minperiodtimeblitzranked``` Minimum seconds per period 
(average time per stone if timecontrol is canadian) for blitz ranked games 

  ```--minperiodtimeblitzunranked``` Minimum seconds per period 
(average time per stone if timecontrol is canadian) for blitz unranked games 

  ```--minperiodtimelive``` Minimum seconds per period 
(average time per stone if timecontrol is canadian) for live games 
(default 10 , which is 10 seconds)

   ```--minperiodtimeliveranked``` Minimum seconds per period 
(average time per stone if timecontrol is canadian) for live ranked games 

   ```--minperiodtimeliveunranked``` Minimum seconds per period 
(average time per stone if timecontrol is canadian) for live unranked games 

  ```--minperiodtimecorr``` Minimum seconds per period 
(average time per stone if timecontrol is canadian) for correspondence games 
(default 14400 , which is 4 hours)

  ```--minperiodtimecorrranked``` Minimum seconds per period 
(average time per stone if timecontrol is canadian) for correspondence ranked games 

  ```--minperiodtimecorrunranked``` Minimum seconds per period 
(average time per stone if timecontrol is canadian) for correspondence unranked games 

#### maxperiodtime 
 For period times below, if timecontrol is canadian, divide the period time 
by the number of stones per period, 

for example max periodtime 
5 minutes / 25 stones = 5*60 /25 = maxperiodtime = 12 

  ```--maxperiodtimeblitz``` Maximum seconds per period 
(average time per stone if timecontrol is canadian) for blitz games 
(default 10 , which is 10 seconds)

  ```--maxperiodtimeblitzranked``` Maximum seconds per period 
(average time per stone if timecontrol is canadian) for blitz ranked games

  ```--maxperiodtimeblitzunranked``` Maximum seconds per period 
(average time per stone if timecontrol is canadian) for blitz unranked games 

  ```--maxperiodtimelive``` Maximum seconds per period 
(average time per stone if timecontrol is canadian) for live games 
(default 120 , which is 2 minutes)

  ```--maxperiodtimeliveranked``` Maximum seconds per period 
(average time per stone if timecontrol is canadian) for live ranked games 

  ```--maxperiodtimeliveunranked``` Maximum seconds per period 
(average time per stone if timecontrol is canadian) for live unranked games 

  ```--maxperiodtimecorr``` Maximum seconds per period 
(average time per stone if timecontrol is canadian) for correspondence games 
(default 259200 , which is 3 days)

  ```--maxperiodtimecorrranked``` Maximum seconds per period 
(average time per stone if timecontrol is canadian) for correspondence ranked games 

  ```--maxperiodtimecorrunranked``` Maximum seconds per period 
(average time per stone if timecontrol is canadian) for correspondence unranked games 

#### minrank
  ```--minrank``` Minimum opponent rank to accept (e.g. 15k)

  ```--minrankranked``` Minimum opponent rank to accept for 
ranked games (e.g. 15k)

  ```--minrankunranked``` Minimum opponent rank to accept for 
unranked games (e.g. 15k)

#### maxrank
  ```--maxrank``` Maximum opponent rank to accept (e.g. 1d)

  ```--maxrankranked``` Maximum opponent rank to accept for 
ranked games (e.g. 1d)

  ```--maxrankunranked``` Maximum opponent rank to accept for 
unranked games (e.g. 1d)

#### greeting
  ```--greeting "Hello, have a nice game"``` 
Greeting message to appear in chat at first move (ex: "Hello, have a nice game")

#### farewell
  ```--farewell "Thank you for playing"``` 
Thank you message to appear in chat at end of game (ex: "Thank you for playing")

#### only
  ```--rankedonly``` Only accept ranked matches

  ```--unrankedonly```  Only accept unranked matches

  ```--proonly``` Only accept matches from professionals

#### minhandicap
  ```--minhandicap```  Min handicap for all games

  ```--minhandicapranked```  Min handicap for ranked games

  ```--minhandicapunranked``` Min handicap for unranked games

**important note** : until the min/max bypass issue is fixed, it is 
recommended to use `--noautohandicap` as well, see 
[#165](https://github.com/online-go/gtp2ogs/pull/165) for details

note 2 : currently, since "automatic" handicap returns the server 
value `notification.handicap` `-1`, using `--minhandicap 0` will 
also disable automatic handicap (because `-1 < 0`), regardless of 
the number of automatic handicap stones

#### maxhandicap
  ```--maxhandicap```  Max handicap for all games

  ```--maxhandicapranked``` Max handicap for ranked games

  ```--maxhandicapunranked``` Max handicap for unranked games

**important note** : until the min/max bypass issue is fixed, it is 
recommended to use `--noautohandicap` as well, see 
[#165](https://github.com/online-go/gtp2ogs/pull/165) for details
  
#### noautohandicap
  ```--noautohandicap``` Do not allow handicap to be set to -automatic-

  ```--noautohandicapranked``` Do not allow handicap to be set to 
-automatic- for ranked games
  
  ```--noautohandicapunranked``` Do not allow handicap to be set to 
-automatic- for unranked games

#### fakerank
  ```--fakerank``` Temporary manual bot ranking input by bot admin 
to fix autohandicap bypass issue, by manualy counting min and max 
number of handicap stones allowed if handicap is "automatic"

This is a temporary fix until server provides bot ranking detection
on gtp2ogs

for example ```--fakerank 6d``` and ```--minhandicap 0 --maxhandicap 4``` 
will allow automatic handicap only for opponents ranked between 2d-6d for 
automatic handicap, but players of any rank (even 25k or 9d+) will be 
notified that they are still able to play up to 4 handicap stones games 
by going in -custom handicap- and manually inputting the number of 
handicap stones

#### nopause
  ```--nopause```  Do not allow games to be paused

  ```--nopauseranked``` Do not allow ranked games to be paused

  ```--nopauseunranked``` Do not allow unranked games to be paused

#### hidden
  ```--hidden``` Hides the botname from the OGS game "Play against 
computer" bot list (but it can still accept challenges)

-> **continue reading in [README.md/Options](/README.md/#options)**
