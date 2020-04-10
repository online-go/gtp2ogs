#### A : 

Currently, ogs does not support profile id number authentification, 
so you have to use bot username only. 

For example, for this famous bot https://online-go.com/player/58441/GnuGo, 
bot admin has to use the bot name `GnuGo` and currently bot admin cannot 
use profile number `58441` (it will not work).

Therefore, the old `id` aliases (`id` , `botid` , `bot`), that 
still required names and not id numbers, contrary to what this 
line was suggesting `Jan 23 17:18:13   #  Bot is user id: 58441`) 
that added confusion to how to use gtp2ogs for bot admins have 
been removed

To sum up, to connect your bot on OGS, you need and you have 
to simply use bot name, for example `--username GnuGo` for 
the bot admin of GnuGo

#### B : 

note : board size format below used on gtp2ogs is 
**width x height (25x1 is NOT THE SAME as 1x25**)

note 2 : `--boardsizes all` is the exact same as 
`--boardsizes custom --boardsizewidths all --boardiszeheights all` 

examples :

ex1 : `--boardsizes custom --boardsizewidths 9,13,15,19,25 --boardsizeheights 1:3,9` 
will allow all these boardsizes :

```
9x1,9x2,9x3,9x9
13x1,13x2,13x3,13x9
15x1,15x2,15x3,15x9
19x1,19x2,19x3,19x9
25x1,25x2,25x3,25x9
```

ex2 : `--boardsizes custom --boardsizewidths 2,19,25 --boardsizeheights all` 
will allow all these boardsizes :

```
2x(all) : 2x1,2x2,2x3,2x4, etc. , 2x23,2x24,2x25
19x(all) : 19x1,19x2,19x3,19x4, etc. ,19x23,19x24,19x25
25x(all) : 25x1,25x2,25x3,25x4, etc. ,25x23,25x24,25x25
```

ex3 : `--boardsizes custom --boardsizewidths all --boardsizeheights 2,19,25` 
will allow all these boardsizes :

```
(all)x2 : 1x2,2x2,3x2,4x2, etc. ,23x2,24x2,25x2
(all)x19 : 1x19,2x19,3x19,4x19, etc. ,23x19,24x19,25x19
(all)x25 : 1x25,2x25,3x25x3,4x25, etc. ,23x25,24x25,25x25
```

ex4 : you may want to be more specific using different values 
for ranked and unranked games, for example :

`--boardsizesranked 19 --boardsizesunranked custom --boardsizewidthsunranked 2,19,25 --boardsizeheightsunranked 1:3`, 
to allow :
- for ranked games : 19x19
- for unranked games : all widths and heights combinations as seen above.

#### C :

About "automatic" komi:

- another example `--komis 7.5` will only accept komi value 
7.5 and will reject any other value.

In that example, note that if `automatic` komi happens to 
have the value 7.5, gtp2ogs will treat `æutomatic` as 
different from the automatic value that ended up being 7.5, 
so we will reject the game, therefore `--komis 7.5,automatic` 
would be needed in that case.

#### D : 

About komis and handicap:

on OGS, black player will always get the handicap stones 
regardless of rank difference (if "automatic" komi is 
selected, the komi will be 0.5) 

but you can restrict allowed komis for example to only 7.5 
or automatic with `--komis 7.5,automatic`

or only 7.5 komi with `--komis 7.5` to play handicap games 
with 7.5 komi, if your bot does not support 0.5 komi value.

#### E : 

for timecontrols:

"absolute" and/or "none" can be manually allowed by bot admin 
intimecontrol if want, but then :

- for absolute games : make sure you increase --minmaintime/
blitz*live*corr higher than default (with current defaults, 
bot will timeout in just a few moves)
- for "none" : games would be very very long

#### F :

Currently, when handicap is automatic, `notification.handicap` 
always returns `-1` regardless of actual handicap stone number 
(ex: `0`, `3`, `5` stones, etc.)

Example use case : 
- `--fakerank 6d` and `--maxhandicap 4` and user ranking 
`2k`
- 

**important note** : until the min/maxhandicap bypass issue 
is fixed (at the server level), it is recommended for botadmin 
(at the gtp2ogs level) to use the `--fakerank` option, or 
`--noautohandicapranked`, see for details :
[#165](https://github.com/online-go/gtp2ogs/pull/165), 
[#207](https://github.com/online-go/gtp2ogs/pull/207),
[#28](https://github.com/online-go/gtp2ogs/issues/28).

#### G : 

when using the "msg" arguments (`--greeting` , `--farewell` , 
`--rejectnew --rejectnewmsg` , some special characters will 
make gtp2ogs crash, such as `!!` (two times `!`) , so test 
special characters in your messages with caution 

these special characters have been tested to work on messages, 
among others :  `!` (one time `!`) , `?` , `,` , `(` , `)` , 
`:` , `;` 

#### H :

##### ogspv extra notes:

note: in the future your AI may have updates that are incompatible 
with the current implementation of pv (variations ingame) of gtp2ogs.

If your AI stops working because of `--ogspv`, you can temporarily stop using 
this option and report the issue on github issues or on the leela zero discord 
until the issue is fixed again.

If you get the error split2 is missing, you can install it locally from your 
gtp2ogs folder with `npm install`, or globally (easier) with `npm install -g split2`.

##### ogspv alternative weights support:

You can run your AI engine **with any weight it supports**, for example 
leela zero engine with 40b, 15b, elf-v0, elf-v1, elf-v2, minigo, etc.

##### ogspv pondering support:

Working with ponder on and off:
- Leela Zero
- Sai
- KataGo
- Leela (on linux)

Not working with ponder at all:
- Leela (on windows)
- PhoenixGo

##### ogspv AI-specific requirements and tips:

to support pv with gtp2ogs `--ogspv`, you need to do these AI specific changes:

for KataGo:
- the requirement to set `ogsChatToStderr=true` in the config.

for PhoenixGo:
- the requirement to disable pondering, you need to set `enable_background_search` 
to `0` in config file.
- show pv in stderr with `--logtostderr` and `--v=1` in command-line options.
