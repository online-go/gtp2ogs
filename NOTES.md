#### A : 

Currently, ogs does not support profile id number authentification, so you have 
to use bot username only. For example, for this famous bot 
https://online-go.com/player/58441/GnuGo , you have to use the bot name `GnuGo` 
and currently you cannot use profile number `58441` (it will not work)

Therefore, the old `id` aliases (`id` , `botid` , `bot`), that still 
required names and not id numbers, contrary to what this line was suggesting 
`Jan 23 17:18:13   #  Bot is user id: 58441`) that added confusion to how to use 
gtp2ogs for bot admins have been removed

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

- another example `--komi 7.5` will only accept komi value 7.5 and will reject 
any other value. In that example, note that if `auto` (automatic) komi happens 
to have the value 7.5, the auto value will be set to 7.5 and will be accepted 
and game will start (bots will always replace any rules with chinese rules, so 
a non handicap game 19x19 on ogs against a bot will always have the komi 7.5)

- the `--komi 7.5` can be useful if your bot handles handicap well, but only with 
the value 7.5 for example (and not 0.5)

#### E : 

example : `--boardsize 19` or `--boardsize 9,19` (most common sizes : 19x19 and 9x9) 
or `--bb 19`

or `--boardsize all` (if you made some fancy bot)
    
if you want to use a "custom" board size, you need to specify wanted custom width(s) 
and height(s) desired

for example : `--boardsize custom --boardsizewidth 25 --boardsizeheight 1` 
will allow only 25x1 board size

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

for some `gtp2ogsarguments`, it is possible to use a shorter version of the argument 
to write faster and with less command length, it is also called "aliases"

The list of aliases can also be found inside [config.js file](/config.js)

For these aliases, the format chosen was ISSA : "intuitive semi-syllabic aliases" 
(easy to write them just by ear : one word one letter, 2 words 2 letters, `0` is min , 
`1` is max )

note : `--farewell` is 2 syllabes but only one word, so only one letter (semi-syllabic) , 

For example, these lines on gtp2ogs.js 

```
    .alias('farewell', 'f')
    .alias('noclock', 'nc')
    .alias('unrankedonly', 'uo')
    .alias('minperiodtime', '0pt')
    .alias('noautohandicap', 'nah')
    .alias('maxmaintimeunranked', '1mtu')

```

mean that the gtp2ogs arguments can be abriged like that : 

- `--farewell` -> `--f`
- `--noclock` -> `--nc`
- `--unrankedonly` -> `--uo`
- `--minperiodtime` -> `--0pt`
- `--noautohandicap` -> `--nah`
- `--maxmaintimeranked` -> `--1mtr`

#### H :

For example, if you can either use :
- `--maxmaintime 600` , the general argument alone**
- OR, if you want different settings for ranked and unranked games, use for example 
`--maxmaintimeranked 300 --maxmaintimeunranked 1800` but if you do that then don't use 
`--minmaintime` !
  
in this example, if `--maxmaintimeranked 300 --maxmaintimeunranked 1800` is set, then 
the general value `--maxmaintime 600` is not taken into account, it will be either 300
seconds (5 minutes) for ranked games, or 1800 seconds (30 minutes) for unranked games

note that some gtp2ogs arguments come with a default general value : for the same reason, 
in that case, the default general value will not be taken into account if you set a 
specific value for ranked and unranked games

