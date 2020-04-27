# Notes

## A

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
-`9:19:2` is `9,11,13,15,17,19`
-`9:19:2`, `9:19:-2`, `19:9:2`, `19:9:-2` are all the exact same
-`9:19:0.5` for boardsizes will be same as `9:19:1` which is the same
 as `9:19`

Finally range and increments can be used many times, and don't conflict
 with text, for example:

- `--boardsizes 9,13:19:2,21:25` is `9,13,15,17,19,21,22,23,24,25`
- `--komis -7:7,automatic,0.5,5.5:7.5` is
 `-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,automatic,0.5,5.5,6.5,7.5`.

## B

note: board size format below used on gtp2ogs is
**width x height (25x1 is NOT THE SAME as 1x25**)

## C

About "automatic" komi:

- another example `--komis 7.5` will only accept komi value
7.5 and will reject any other value.

In that example, note that if `automatic` komi happens to
have the value 7.5, gtp2ogs will treat `automatic` as
different from the automatic value that ended up being 7.5,
so we will reject the game, therefore `--komis 7.5,automatic`
would be needed in that case.

## D

About komis and handicap:

on OGS, black player will always get the handicap stones
regardless of rank difference (if "automatic" komi is
selected, the komi will be 0.5)

but you can restrict allowed komis for example to only 7.5
or automatic with `--komis 7.5,automatic`

or only 7.5 komi with `--komis 7.5` to play handicap games
with 7.5 komi, if your bot does not support 0.5 komi value.

## E

for timecontrols:

"absolute" and/or "none" can be manually allowed by bot admin
intimecontrol if want, but then:

- for absolute games: make sure you increase --minmaintime/
blitz*live*corr higher than default (with current defaults,
bot will timeout in just a few moves)
- for "none": games would be very very long

## F

Currently, when handicap is automatic, ogs does not inform us
what the handicap is before accepting the challange.
Also, challange notifications do not contain our rank.
With fakerank we can estimate the handicap based on the oponent
ranking and our (fake) rank.

Example use case:
`--fakerank 6d --maxhandicap 4` and user ranking `2k`:
Expected handicap is 6d-2k = 8 ranks. 8 ranks > 4 max handicap
=> Challenge rejected.

**important note**: until the min/maxhandicap bypass issue
is fixed (at the server level), it is recommended for botadmin
(at the gtp2ogs level) to use the `--fakerank` option, or
`--noautohandicapranked`, see for details:
[#165](https://github.com/online-go/gtp2ogs/pull/165),
[#207](https://github.com/online-go/gtp2ogs/pull/207),
[#28](https://github.com/online-go/gtp2ogs/issues/28).

## G

when using the "msg" arguments (`--greeting` , `--farewell` ,
`--rejectnew --rejectnewmsg` , some special characters will
make gtp2ogs crash, such as `!!` (two times `!`) , so test
special characters in your messages with caution

these special characters have been tested to work on messages,
among others:  `!` (one time `!`) , `?` , `,` , `(` , `)` ,
`:` , `;`

## H

### ogspv extra notes

note: in the future your AI may have updates that are incompatible
with the current implementation of pv (variations ingame) of gtp2ogs.

If your AI stops working because of `--ogspv`, you can temporarily stop using
this option and report the issue on github issues or on the leela zero discord
until the issue is fixed again.

If you get the error split2 is missing, you can install it locally from your
gtp2ogs folder with `npm install`, or globally (easier) with `npm install -g split2`.

### ogspv alternative weights support

You can run your AI engine **with any weight it supports**, for example
leela zero engine with 40b, 15b, elf-v0, elf-v1, elf-v2, minigo, etc.

### ogspv pondering support

Working with ponder on and off:

- Leela Zero
- Sai
- KataGo
- Leela (on linux)

Not working with ponder at all:

- Leela (on windows)
- PhoenixGo

### ogspv AI-specific requirements and tips

to support pv with gtp2ogs `--ogspv`, you need to do these AI specific changes:

for KataGo:

- the requirement to set `ogsChatToStderr=true` in the config.

for PhoenixGo:

- the requirement to disable pondering, you need to set `enable_background_search`
to `0` in config file.
- show pv in stderr with `--logtostderr` and `--v=1` in command-line options.
