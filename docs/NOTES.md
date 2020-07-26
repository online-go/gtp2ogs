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
what the handicap is before accepting the challenge.

We always get notification.handicap equal to `-1` if handicap is
automatic, regardless of actual number of handicap stones in the game.

That's why gtp2ogs automatically enables noautohandicap (or ranked unranked)
option if minhandicap (or ranked unranked) is used and higher than -1
(ex: `--minhandicap 0` or `--minhandicap 2` for example)

## G

### rejectnewmsg

when using the "msg" options (`--greeting` , `--farewell` ,
`--rejectnew --rejectnewmsg` , some special characters will
make gtp2ogs crash, such as `!!` (two times `!`) , so test
special characters in your messages with caution

these special characters have been tested to work on messages,
among others:  `!` (one time `!`) , `?` , `,` , `(` , `)` ,
`:` , `;`

### rejectnewfile

Location can either be absolute (ex: ~/ or /home/myUsername/) or
relative (for relative paths, it is relative to your current shell path
(ex: if your shell is in ~/ and your rejectnew file is in ~/gtp2ogs/rejectnewfiles,
do ./rejectnewfiles/rejectnew-file.txt, ex2: if your shell is in ~/gtp2ogs_logs
and your rejectnewfile is in ~/gtp2ogs_rejectnewfiles/, do
../gtp2ogs_logs/rejectnewfiles/rejectnew-file.txt)

Rejectnewfile is checked again at every challenge, can use for load-balancing)

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
