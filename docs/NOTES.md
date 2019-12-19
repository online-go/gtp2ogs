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
(if "Automatic" komi is selected, the komi will be 0.5) 

but you can restrict allowed komis for example to only 7.5 or Automatic with 
`--komis 7.5,Automatic`

or only 7.5 komi with `--komis 7.5` to play handicap games with 7.5 komi, if your bot 
does not support 0.5 komi value.

#### D :

explanation on how to use komis argument:

- `--komis Automatic,0.5,7.5` for example, will allow any of these komi values : 
Automatic, 0.5, or 7.5, and will reject any other value

- another example `--komis 7.5` will only accept komi value 7.5 and will reject 
any other value. In that example, note that if `Automatic` komi happens 
to have the value 7.5, the Automatic value will be set to 7.5 and will be accepted 
and game will start (bots will always replace any rules with chinese rules, so 
a non handicap game 19x19 on ogs against a bot will always have the komi 7.5)

- the `--komis 7.5` can be useful if your bot handles handicap well, but only with 
the value 7.5 for example (and not 0.5)

#### E : 

example : `--boardsizes 19` or `--boardsizes 9,19` (most common sizes : 19x19 and 9x9) 

or `--boardsizes all` (if you made some fancy bot)
    
if you want to use a "custom" board size, you need to specify wanted custom width(s) 
and height(s) desired

for example : `--boardsizes custom --boardsizewidths 25 --boardsizeheights 1` 
will allow only 25x1 board size

or another example `--boardsizes custom --boardsizewidths 9,10,11 --boardsizeheights 9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25` 
will allow all possible combinations of width and height here (there 3 multiplied by 
17 possible combinations here, which is 51 possible board sizes !

finally, it is possible to play "official" boardsizes too with this setting, 
for example `--boardsizes custom --boardsizewidths 9 --boardsizeheights 9,19` will 
allow 9x9 and 9x19 board sizes

#### F : 

when using the "msg" arguments (`--greeting` , `--farewell` , `--rejectnew --rejectnewmsg` , 
some special characters will make gtp2ogs crash, such as `!!` (two times `!`) , 
so test special characters in your messages with caution 

these special characters have been tested to work on messages, among others :  `!` 
(one time `!`) , `?` , `,` , `(` , `)` , `:` , `;` 

