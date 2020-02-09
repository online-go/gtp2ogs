below is a list of all available gtp2ogs arguments, 

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
--nopause false/false
--boardsizes 9,13,19/...
--komis automatic/...
--rules chinese/...
--challengercolors all/...
--speeds all/...
--timecontrols fischer,byoyomi,simple,canadian/...
--maintimeblitz 15:300/...
--maintimelive 60:7200/...
--maintimecorr 259200:604800/...
--periodsblitz 3:20/...
--periodslive 3:20/...
--periodscorr 3:10/...
--periodtimeblitz 5:10/...
--periodtimelive 10:120/...
--minperiodtimecorr 14400:259200/...
```

note : command line arguments should not be separated by skipping 
lines, it was done here only for clearer display

# 1) ROOT ARGUMENTS :

  Arguments in this category work the same way no matter what 
the ranked/unranked status is.

Note: about the "messages" arguments, some combinations of 
characters in messages make gtp2ogs crash !!
see for details [notes G-](/docs/NOTES.md#g-)

#### username
  ```--username``` Specify the username of the bot, for example 
`--username GnuGo`, see [notes H-](/docs/NOTES.md#H-) for details

#### apikey
  ```--apikey``` Specify the API key for the bot, for example 
`--apikey 5srvb5es4se7651741r61devr864re`

note : in debug, the apikey is replaced with a "hidden" for 
security reasons

#### greeting
  ```--greeting "Hello, have a nice game"``` 
Greeting message to appear in chat at first move 
(ex: "Hello, have a nice game")

see for details [notes G-](/docs/NOTES.md#g-)

#### farewell
  ```--farewell "Thank you for playing"``` 
Thank you message to appear in chat at end of game 
(ex: "Thank you for playing")

see for details [notes G-](/docs/NOTES.md#g-)

#### rejectnew arguments :
  ```--rejectnew``` Reject all new challenges with the default 
reject message

  ```--rejectnew --rejectnewmsg "not accepting games because blablablah"``` 
if you add the rejectnewmsg argument, Reject all new challenges with a 
customized message instead of the default message.

see for details [notes G-](/docs/NOTES.md#g-)

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
  ```--showboard```  Set this if bot understands the showboard 
GTP command, and if you want to display the showboard output

- This breaks some bots which dont support it (ex: PhoenixGo)
- And this makes the log much bigger, so may not be desired even 
if supported

So default is disabled

#### persist
  ```--persist```  Bot process remains running between moves

#### noclock
  ```--noclock``` Do not send any clock/time data to the bot

#### corrqueue
  ```--corrqueue``` Process correspondence games one at a time

#### maxconnectedgames
  ```--maxconnectedgames``` Maximum number of connected games 
for all users against your bot (correspondence games are currently 
included in the connected games count, see 
[#59](https://github.com/online-go/gtp2ogs/issues/59) for details), 
which means the maximum number of games your bot can play at the 
same time (choose a low number to regulate your computer performance 
and stability)

#### maxconnectedgamesperuser
  ```--maxconnectedgamesperuser``` Maximum number of 
connected games per user against this bot


#### only (part 1)
  ```--rankedonly``` Only accept ranked matches

  ```--unrankedonly```  Only accept unranked matches

  ```--privateonly```  Only accept private matches

  ```--publiconly```  Only accept public (non-private) matches

#### fakebotrank
  ```--fakebotrank``` Fake bot ranking to calculate automatic handicap 
stones number in autohandicap (-1) based on rankDifference between 
fakebotrank and user ranking, to fix the bypass minhandicap maxhandicap 
issue

see [notes F-](/docs/NOTES.md#f-) for details

# 2) ARGUMENTS TO CHECK RANKED/UNRANKED CHALLENGES:

  Arguments in this category allow us to accept or reject 
a challenge based on the notification (challenge settings)

##     A) ALL/RANKED/UNRANKED FAMILIES:

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



##     B) RANKED/UNRANKED FAMILIES :

  Here you can either use :

- only the general argument (ex: `--maxhandicap 2`), the same setting 
will be used for ranked and unranked games

- OR both the ranked AND the unranked arguments 
(ex: `--maxhandicapranked 0 --maxhandicapunranked 9`), 
and in that case, the general argument will be ignored 
and instead the ranked and unranked will be used depending 
on whether the game is ranked or unranked.

##         B1) ALLOWED FAMILIES RANKED/UNRANKED:

  For the allowed families arguments, you can either use the value :
- `all` : will allow ALL possible values
- for text-only families ("blitz", "fischer", "white", etc.), 
comma-separated values (without space) will allow every value 
inputted, every other value will be rejected
- for numbers +/- text families (5.5,6.5,7.5 (komis), 9,13,19 
(boardsizes)), it is possible to use as well the "range" 
operator `:` to navigate one by one from min to max (ex: 
`5.5:7.5` is `5.5,6.5,7.5` and `13:17` is `13,14,15,16,17`), 
as well as the "increment" operator (ex: `13:19:2` is `13,15,17,19`, 
see [notes A-](/docs/NOTES.md#a-) for details.

example: `--speeds all`
example 2: `--speedsranked live,correspondence --speedsunranked all`
example 3: `--komis 0.5,5.5:7.5,automatic`

#### boardsizes


                    // - for --boardsizes, if --boardsizeheights is not specified,
                    //   we check square (width === height) boardsizes using only the widths
                    //   ex: --boardsizes 19 -> 19x19
                    // - if bot admin wants to check non square boardsizes as well, bot admin 
                    //   has to use --boardsizeheights
                    //   ex: --boardsizes 19 --boardsizeheights 1:3
                    // - if bot admin doesnt want to allow square boardsizes based on widths,
                    //   bot admin has to use --boardsizesnonsquareonly
                    //   ex: --boardsizes 19 --boardsizesnonsquareonly --boardsizeheights 1:3


  ```--boardsizes``` Board size(s) to accept



Possible boardsize width value(s) :
- `all` (allows all board size widths)
- `custom` (format switches from allow square boardsizes only 
to allow combinations of boardsize widths/heights)
- comma separated and `:` separated values, for example 
`25` (allows 25x25), or `9,13,15:17,19` (allows 
9x9, 13x13, 15x15, 16x16, 17x17, 19x19)

#### boardsize widths/heights

  ```--boardsizewidths``` For custom board sizes, boardsize 
width(s) to accept




```--boardsizeheights``` For custom board sizes, boardsize 
height(s) to accept


Possible boardsize height value(s):
- `all` (allows all board size heights)
- comma separated values, for example `1`, or `1:3` 

  For custom boardsizes, we allow all combinations of allowed 
widths and heights, for example :

- `--boardsizes custom --boardsizewidths 9,13,15,19,25 --boardsizeheights 1:3,9:19:5` 
(is `1,2,3,9,14,19`) will allow all these boardsizes combinations:
```
9x1,9x2,9x3,9x9,9x14,9x19
13x1,13x2,13x3,13x9,13x14,13x19
15x1,15x2,15x3,15x9,15x14,15x19
19x1,19x2,19x3,19x9,19x14,19x19
25x1,25x2,25x3,25x3,25x14,25x19
```

see [notes B-](/docs/NOTES.md#b-) for details.

#### komis
  ```--komis``` Allowed komi values


 
Possible komi value(s):
- `all` (allows all komis)
- comma separated and `:` separated values, 
for example `7.5` (allows komi 7.5), or `5.5:7.5,0.5,automatic` allows komis 
(5.5, 6.5, 7.5, 0.5, automatic), or `-2:3:0.5` (allows komis 
(-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3).

For extra komi explanations, see :
- [notes C-](/docs/NOTES.md#c-)
- [notes D-](/docs/NOTES.md#d-)

#### rules

  ```--rules``` Board size(s) to accept



Possible rules value(s) : 
- `all` (allows all rules)
- comma separated values, for example `chinese`, or `chinese,japanese,aga` 

Full list of possible values :  `chinese`, `japanese`, AGA, etc. 
(will update actual rule name string later TODO)

#### challengercolors

  ```--challengercolors``` Challenger color(s) to accept



Possible challengercolors value(s) : 
- `all` (allows all challengercolors)
- comma separated values, for example `white`, or `automatic,random` 

Full list of possible values :  `black`, `white`, `automatic`, `random`

#### speeds
  ```--speeds``` Comma separated list of Game speed(s) to accept 



Possible speed value(s) :
- `all` (allows all speeds)
- comma separated values, for example `blitz`, or `live, correspondence`

Full list of possible values :  `blitz`,  `live`, `correspondence`.

#### timecontrols
  ```--timecontrols``` Time control(s) to accept



Possible timecontrol value(s) :
- `all` (allows all timecontrol values)
- comma separated values, for example `byoyomi`, or `fischer, byoyomi, simple`

Full list of possible values :  `fischer`,  `byoyomi`, `canadian`, 
`simple`, `absolute`, `none`.

see [notes E-](/docs/NOTES.md#e-) for details

##         B2) BOOLEANS RANKED/UNRANKED:




#### only (part 2)

  ```--proonly``` For all matches, only accept those from professionals

  ```--boardsizeheightsnonsquareonly``` Use this in combination with 
--boardsizeheights (allows non-square boardsizes (ex: 19x18 and 18x19)) 
to specifically reject matches with square boardsizes combinations of 
widths and heights (ex:19x13, 13x19) for ranked / unranked games')



#### nopause

  ```--nopause```  Do not allow pauses during games



#### nopauseonweekends

note: this setting has no effect on pausing DURING games, here 
we only accept or reject a match if it comes with the setting 
"Pause on week-ends" (specific to correspondence games)

  ```--nopauseonweekends```  Do not accept matches that come with the 
option -pauses on weekends- (specific to correspondence games)



#### noautohandicap
  ```--noautohandicap``` Do not allow handicap to be set to -automatic-


##         B2) MINMAX FAMILIES RANKED/UNRANKED:


#### handicap



  ```--minhandicap```  Minimum handicap to accept



**important note** : see [fakebotrank](#fakebotrank).

#### rank



  ```--minrank``` Minimum opponent rank to accept (e.g. 15k)





#### maintime blitz/live/corr



  ```--minmaintimeblitz``` Minimum seconds of main time for 
blitz games (default 15 , which is 15 seconds)



  ```--minmaintimelive``` Minimum seconds of main time for 
live games (default 30 , which is 30 seconds)



  ```--minmaintimecorr``` Minimum seconds of main time for 
correspondence games (default 259200 , which is 3 days)



#### periods blitz/live/corr


  ```--minperiodsblitz``` Minimum number of periods for 
blitz games



  ```--minperiodslive``` Minimum number of periods for 
live games



  ```--minperiodscorr``` Minimum number of periods for 
correspondence games





#### periodtime blitz/live/corr

 For period times below, if timecontrol is canadian, divide the 
wanted period time for all the stones by the number of stones per period, 

for example max periodtime 
5 minutes / 25 stones = 5*60 /25 = maxperiodtime = 12 (seconds)



  ```--minperiodtimeblitz``` Minimum seconds per period 
(average time per stone if timecontrol is canadian) for blitz games 
(default 5 , which is 5 seconds)



  ```--minperiodtimelive``` Minimum seconds per period 
(average time per stone if timecontrol is canadian) for live games 
(default 10 , which is 10 seconds)



  ```--minperiodtimecorr``` Minimum seconds per period 
(average time per stone if timecontrol is canadian) for correspondence games 
(default 14400 , which is 4 hours)



# extra : notes :

Additional notes have been added [here](/docs/NOTES.md)

-> **continue reading in [README.md/Options](/README.md/#options)**
