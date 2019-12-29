below is a list of all possible to use gtp2ogs arguments, 

Since they take a lot of place all the list has been moved here

use the ones you want only, no need to use them all !

# DEFAULT VALUES SUMMARY

Also, some options come provided with a default, so even if 
you don't input any value, it will work as-is

However, you can also use your own value if you want : this will 
overwrite the default one

For easier reference, you can see below all default values gtp2ogs 
currently provides :

```
--host online-go.com
--port 443
--startupbuffer 5
--timeout 0
--maxconnectedgames 20
--maxconnectedgamesperuser 3
--rejectnewmsg "Currently, this bot is not accepting games, try again later "
--boardsizes 9,13,19
--komis automatic
--speeds blitz,live,correspondence
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

note : command line arguments should not be separated by skipping 
lines, it was done here only for clearer display


# 1) ROOT ARGUMENTS :

  Arguments in this category work the same way no matter what 
the ranked/unranked status is.

Note: about the "messages" arguments, some combinations of 
characters in messages make gtp2ogs crash !!
see for details [notes G-](/docs/docs/NOTES.md#g-)

#### username
  ```--username``` Specify the username of the bot, for example 
`--username GnuGo`, see [notes A-](/docs/NOTES.md#a-) for details

#### apikey
  ```--apikey``` Specify the API key for the bot, for example 
`--apikey 5srvb5es4se7651741r61devr864re`

note : in debug, the apikey is replaced with a "hidden" for 
security reasons

#### greeting
  ```--greeting "Hello, have a nice game"``` 
Greeting message to appear in chat at first move 
(ex: "Hello, have a nice game")

see for details [notes G-](/docs/docs/NOTES.md#g-)

#### farewell
  ```--farewell "Thank you for playing"``` 
Thank you message to appear in chat at end of game 
(ex: "Thank you for playing")

see for details [notes G-](/docs/docs/NOTES.md#g-)

#### rejectnew arguments :
  ```--rejectnew``` Reject all new challenges with the default 
reject message

  ```--rejectnew --rejectnewmsg "not accepting games because blablablah"``` 
if you add the rejectnewmsg argument, Reject all new challenges with a 
customized message instead of the default message.

see for details [notes G-](/docs/docs/NOTES.md#g-)

  ```--rejectnewfile ~/rejectnew.status``` Reject new challenges if 
file exists (checked each time, can use for load-balancing)

#### debug
```--debug```  Output GTP command and responses from your Go engine

#### logfile
```--logfile``` In addition to logging to the console, also log gtp2ogs 
output to a text file

#### json
```--json```  Send and receive GTP commands in a JSON encoded format

#### beta
```--beta```  Connect to the [beta server](https://beta.online-go.com/) 
instead of [OGS](https://online-go.com/) (changes host automatically)

#### host
```--host``` OGS Host to connect to

#### port
```--port``` OGS Port to connect to

#### insecure
```--insecure```  Do not use ssl to connect to the ggs/rest servers

#### hidden
  ```--hidden``` Hides the botname from the OGS game "Play against 
computer" bot list (but it can still accept challenges)

#### startupbuffer
  ```--startupbuffer``` Subtract this many seconds from time 
available on first move (if set)

#### timeout
```--timeout``` Disconnect from a game after this many seconds (if set)

#### kgstime
  ```--kgstime```  Set this if bot understands the kgs-time_settings command

#### showboard
  ```--showboard```  Set this if bot understands the showboard GTP command, 
and if you want to display the showboard output

- This breaks some bots which dont support it (ex: PhoenixGo)
- And this makes the log much bigger, so may not be desired even if supported

So default is disabled

#### persist
  ```--persist```  Bot process remains running between moves

#### noclock
  ```--noclock``` Do not send any clock/time data to the bot

#### nopause

  ```--nopause```  Do not allow pauses during games

  ```--nopauseranked``` Do not allow pauses during ranked games

  ```--nopauseunranked``` Do not allow pauses during unranked games

#### corrqueue
  ```--corrqueue``` Process correspondence games one at a time

#### maxconnectedgames
  ```--maxconnectedgames``` Maximum number of connected games 
for all users against your bot (correspondence games are currently included in 
the connected games count, see [#59](https://github.com/online-go/gtp2ogs/issues/59) 
for details) , which means the maximum number of games your bot can play at the 
same time (choose a low number to regulate your computer performance and 
stability)

#### maxconnectedgamesperuser
  ```--maxconnectedgamesperuser``` Maximum number of 
connected games per user against this bot


#### only (part 1)
  ```--rankedonly``` Only accept ranked matches

  ```--unrankedonly```  Only accept unranked matches

  ```--proonly``` For all matches, only accept those from professionals

#### fakerank
  ```--fakerank``` Fake bot ranking to calculate automatic handicap 
stones number in autohandicap (-1) based on rankDifference between 
fakerank and user ranking, to fix the bypass minhandicap maxhandicap 
issue if handicap is -automatic

see [notes F-](/docs/docs/NOTES.md#f-) for details

# 2) ARGUMENTS TO CHECK RANKED/UNRANKED CHALLENGES:

  Arguments in this category allow us to accept or reject 
a challenge based on the notification (challenge settings)

##     A) ALL/RANKED/UNRANKED FAMILIES :

  Here the general argument (ex: --bans) does not confict with 
the ranked and unranked arguments for accepting/rejecting matches.

example: 
`--bans A,B --bansranked X,Y --bansunranked Z`
result of these bans arguments :
- banned users for ranked games : A,B,X,Y
- banned users for unranked games : A,B,Z

#### bans
  ```--bans``` Comma separated list of user names or IDs who 
are banned from ranked and unranked games

  ```--bansranked``` Comma separated list of user names or IDs who 
are banned from ranked games

  ```--bansunranked``` Comma separated list of user names or IDs who 
are banned from unranked games

##     B) GENERAL/RANKED/UNRANKED FAMILIES :

  Here you can either use :

- only the general argument (ex: `--maxhandicap 2`), the same setting 
will be used for ranked and unranked games

- OR both the ranked AND the unranked arguments 
(ex: `--maxhandicapranked 0 --maxhandicapunranked 9`), 
and in that case, the general argument will be ignored 
and instead the ranked and unranked will be used depending 
on whether the game is ranked or unranked.

##         B1) ALLOWED FAMILIES :

  For the allowed families arguments, you can either use the value :
- `all` : will allow ALL possible values
- comma-separated values (without space) will allow every value inputted, 
every other value will be rejected

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
  ```--komis``` Allowed komi values

  ```--komisranked``` Allowed komi values for ranked games

  ```--komisunranked``` Allowed komi values for unranked games
 
Possible komi values (other than `all`) : 
- `automatic` (allows automatic komi), 
- comma separated values, for example `7.5`, or `7.5,6.5,0.5,automatic`

For extra komi explanations, see :
- [notes C-](/docs/docs/NOTES.md#c-)
- [notes D-](/docs/docs/NOTES.md#d-)

#### speeds
  ```--speeds``` Comma separated list of Game speed(s) to accept 

  ```--speedsranked``` Comma separated list of Game speed(s) to 
accept for ranked games

  ```--speedsunranked``` Comma separated list of Game speed(s) to 
accept for unranked games

#### timecontrols
  ```--timecontrols``` Time control(s) to accept

  ```--timecontrolsranked``` Time control(s) to accept for ranked 
games

  ```--timecontrolsunranked``` Time control(s) to accept for unranked 
games

Full list of possible values :  `fischer`,  `byoyomi`, `canadian`, 
`simple`, `absolute`, `none`.

see [notes E-](/docs/docs/NOTES.md#e-) for details

##         B2) GENERIC GENERAL/RANKED/UNRANKED ARGUMENTS :

#### noautohandicap
  ```--noautohandicap``` Do not allow handicap to be set to -automatic-

  ```--noautohandicapranked``` Do not allow handicap to be set to 
-automatic- for ranked games
  
  ```--noautohandicapunranked``` Do not allow handicap to be set to 
-automatic- for unranked games

#### min/max handicap

  min :

  ```--minhandicap```  Minimum handicap to accept

  ```--minhandicapranked```  Mininimum handicap to accept for ranked games

  ```--minhandicapunranked``` Minimum handicap to accept for unranked games

  max :

  ```--maxhandicap```  Maximum handicap to accept for all games

  ```--maxhandicapranked``` Maximum handicap to accept for ranked games

  ```--maxhandicapunranked``` Maximum handicap to accept for unranked games

**important note** : see [fakerank](https://github.com/online-go/gtp2ogs/blob/devel/docs/OPTIONS-LIST.md#fakerank).

#### min/max rank

  min :

  ```--minrank``` Minimum opponent rank to accept (e.g. 15k)

  ```--minrankranked``` Minimum opponent rank to accept for 
ranked games (e.g. 15k)

  ```--minrankunranked``` Minimum opponent rank to accept for 
unranked games (e.g. 15k)

  max :

  ```--maxrank``` Maximum opponent rank to accept (e.g. 1d)

  ```--maxrankranked``` Maximum opponent rank to accept for 
ranked games (e.g. 1d)

  ```--maxrankunranked``` Maximum opponent rank to accept for 
unranked games (e.g. 1d)

#### min/max maintime blitz/live/corr


  min :


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


  max :


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

#### min/max periods blitz/live/corr


  min :


  ```--minperiodsblitz``` Minimum number of periods for 
blitz games

  ```--minperiodsblitzranked``` Minimum number of periods 
for blitz ranked games

  ```--minperiodsblitzunranked``` Minimum number of periods 
for blitz unranked games

  ```--minperiodslive``` Minimum number of periods for 
live games

  ```--minperiodsliveranked``` Minimum number of periods 
for live ranked games

  ```--minperiodsliveunranked``` Minimum number of periods 
for live unranked games

  ```--minperiodscorr``` Minimum number of periods for 
correspondence games

  ```--minperiodscorrranked``` Minimum number of periods 
for correspondence ranked games

  ```--minperiodscorrunranked``` Minimum number of periods 
for correspondence unranked games


  max :


  ```--maxperiodsblitz``` Maximum number of periods for 
blitz games

  ```--maxperiodsblitzranked``` Maximum number of periods 
for blitz ranked games

  ```--maxperiodsblitzunranked``` Maximum number of periods 
for blitz unranked games

  ```--maxperiodslive``` Maximum number of periods for 
live games

  ```--maxperiodsliveranked``` Maximum number of periods 
for live ranked games

  ```--maxperiodsliveunranked``` Maximum number of periods 
for live unranked games

  ```--maxperiodscorr``` Maximum number of periods for 
correspondence games

  ```--maxperiodscorrranked``` Maximum number of periods 
for correspondence ranked games

  ```--maxperiodscorrunranked``` Maximum number of periods 
for correspondence unranked games

#### min/max periodtime blitz/live/corr

 For period times below, if timecontrol is canadian, divide the 
wanted period time for all the stones by the number of stones per period, 

for example max periodtime 
5 minutes / 25 stones = 5*60 /25 = maxperiodtime = 12 (seconds)


  min :


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


  max :


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

# extra : notes :

Additional notes have been added [here](/docs/NOTES.md)

-> **continue reading in [README.md/Options](/README.md/#options)**
