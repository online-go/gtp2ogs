#### A : 

For numbers +/- text allowed families, it is possible to choose a 
range of allowed values faster using the "range" operator `:` ,
and optionally the "increment" operator `:` (default increment is `1`).

note: for safety reasons, the max list length using the "range" 
with/without the "increment" operator is 1000 values.

- "range":

instead of doing `9,10,11,12,13,14,15,16,17,18,19`, you can simply do 
`9:19` which means select all values from 9 to 19 with a +1 distance 
between each value (increment)

range can be safely reversed: `19:9` will work the exact same as `9:19`, 
because the range algorithm detects min and max value before applying 
the increment.

- "increment":

increment is the distance between two values in the range.

Default increment is `1`, for example `9:19:1` is the same as `9:19`.

Because we detect min and max before doing the range, increment can be 
both positive and negative, it will work the exact same way.

Finally, decimal increments such as (`0.5` or `19.5`) only work 
for komis.

Other families, for example boardsizes, can only be 
integers (`0`, `1`) so in that case the increment will be 
ceiled to next value, for example `2.5` will be `3`, `2.189` 
will be ceiled to `3`.

examples :
- `9:19:2` is `9,11,13,15,17,19`
- `9:19:2`, `9:19:-2`, `19:9:2`, `19:9:-2` are all the exact same
- `9:19:0.5` for boardsizes will be same as `9:19:1` which is the same 
as `9:19`
- `

Finally range and increments can be used many times, and don't conflict 
with text, for example:

- `--boardsizes 9,13:19:2,21:25` is `9,13,15,17,19,21,22,23,24,25`
- `--komis -7:7,automatic,0.5,5.5:7.5` is 
`-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,automatic,0.5,5.5,6.5,7.5`.

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
`--fakebotrank 6d --maxhandicap 4` and user ranking `2k`:

- Automatic handicap stones: 6d - 2k = 8 rank difference 
=> 8 automatic handicap stones
- but max handicap is 4 stones
- 8 (detected automatic stones wanted by user) > 
max stones allowed 4 => challenge rejected

**important note** : until the min/maxhandicap bypass issue 
is fixed (at the server level), it is recommended for botadmin 
(at the gtp2ogs level) to use the `--fakebotrank` option, or 
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

####  H:

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