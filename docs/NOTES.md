# Notes

## A

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

when using the "msg" options (`--greeting` , `--farewell` ,
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
gtp2ogs folder with `npm install`.

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

## I

Example of use:

### If we start gtp2ogs at 08:10

- `--rejectnewtimethreshold 02:00` will reject new games starting from **tomorrow** at 02:00
- `--rejectnewtimethreshold 08:25` will reject new games starting from today at 08:25
- `--rejectnewtimethreshold 10:05` will reject new games starting from today at 10:05
- `--rejectnewtimethreshold 21:30` will reject new games starting from today at 21:30
- `--rejectnewtimethreshold 23:05` will reject new games starting from today at 23:05

## If we start gtp2ogs at 21:45

- `--rejectnewtimethreshold 02:00` will reject new games starting from **tomorrow** at 02:00
- `--rejectnewtimethreshold 08:25` will reject new games starting from **tomorrow** at 08:25
- `--rejectnewtimethreshold 10:05` will reject new games starting from **tomorrow** at 10:05
- `--rejectnewtimethreshold 21:30` will reject new games starting from **tomorrow** at 21:30
- `--rejectnewtimethreshold 23:05` will reject new games starting from today at 23:05
