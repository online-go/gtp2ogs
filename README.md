# gtp2ogs

[![Build Status](https://travis-ci.org/online-go/gtp2ogs.svg?branch=devel)](https://travis-ci.org/online-go/gtp2ogs)

This javascript tool allows all bots/AI that support
 [GTP (Go Text Protocol)](https://senseis.xmp.net/?GoTextProtocol)
 to communicate with [OGS (Online-Go.com Server)](https://online-go.com/).

After being configured, gtp2ogs is ready to work as-is,
 but it is also possible to customize it.

Being a bot admin on OGS means:

- you can put your bot online whenever you want
- choose settings to automatically accept or reject challenges
 (example: rank, board size, blitz/live/correspondence, etc.), or to
 control your GPU/computing device power spent (max number of
 simultaneous games, corrqueue, etc.)
- choose your bot-specific options (for example `-v 1600` for leela-zero, etc.)

## Full tutorial

The full tutorial has screenshots, examples, and detailed explanations for windows and linux.

You can see it [here](https://github.com/wonderingabout/gtp2ogs-tutorial).

## Quick Installation Guide

The "node.js" package is bundled with:

- node: to run gtp2ogs.js
- npm: (node package manager), to install gtp2ogs.

You can find operating system specific instructions below:

- for Windows, see [the Windows Installation Guide](/docs/INSTALLATION-WINDOWS.md)
- for Linux, see [the Linux Installation Guide](/docs/INSTALLATION-LINUX.md)

## Options

After installing gtp2ogs, we need to specify the settings. This is what we do with
 gtp2ogs options.

To set up an option in gtp2ogs, you need to enter it as a command-line argument.

### gtp2ogs arguments

Command-line arguments can be written in any order.

Some options are mandatory:

- [username](/docs/OPTIONS-LIST.md#username)
- [apikey](/docs/OPTIONS-LIST.md#apikey)

You can find all available options in [OPTIONS-LIST](/docs/OPTIONS-LIST.md).

### bot arguments

After that, use a ` -- ` (with one space before and one space after the `--`)
 to separate gtp2ogs arguments from bot arguments.

Then specify your bot arguments.

All in all, general use is something like this:

`node_executable path/to/gtp2ogs.js --username <yourbotusername> --apikey <apikey> [arguments] -- path/to/your/ai/executable [bot arguments]`

## Example of use

In this example AI is PhoenixGo, but it works in a similar way for any AI.

The number of gtp2ogs options and of bot arguments is free.

### For Windows

`node C:\Users\yourusername\gtp2ogs\gtp2ogs.js --apikey 5rg46ze84f68e4g6v4e4g68es4g8 --username somebot --debug --ogspv PhoenixGo --noclock --unrankedonly --minrank 1d --noautohandicapranked --maxhandicap 0 --boardsizes 19 --komis 7.5 --speeds live --maxmaintimelive 600 --maxperiodsliveranked 5 --maxperiodsliveunranked 10 --maxperiodtimeliveranked 60 --maxperiodtimeliveunranked 180 -- C:\Users\yourusername\PhoenixGo\mcts\mcts_main --gtp --config_path C:\Users\yourusername\PhoenixGo\etc\mcts_1gpu_beta.conf --logtostderr --v 1`

### For Linux

`node ~/gtp2ogs/gtp2ogs.js --apikey 5rg46ze84f68e4g6v4e4g68es4g8 --username somebot --debug --ogspv PhoenixGo --noclock --unrankedonly --minrank 1d --noautohandicapranked --maxhandicap 0 --boardsizes 19 --komis 7.5 --speeds live --maxmaintimelive 600 --maxperiodsliveranked 5 --maxperiodsliveunranked 10 --maxperiodtimeliveranked 60 --maxperiodtimeliveunranked 180 -- /home/amd2020/PhoenixGo/bazel-bin/mcts/mcts_main --gtp --config_path=/home/amd2020/PhoenixGo/etc/mcts_1gpu_beta.conf --logtostderr --v=1`

## Beta OGS

Before you can play on official [OGS server](https://online-go.com/) server,
 OGS admins will often ask that you run tests to make sure everything is running fine.

You need to do these tests in [beta OGS server](https://beta.online-go.com/),
 by adding the option [--beta](/docs/OPTIONS-LIST.md#beta).

When all testing is OK, you can remove the `--beta` and play in the real OGS.

## Submit Move Button

To avoid accidental misclicks while spectating a game from your bot account, see
 [Submit-Move Button](https://github.com/wonderingabout/gtp2ogs-tutorial#important-submit-move-button).

## Show winrate and variations in games

gtp2ogs has native support for showing ingame winrate and variations for some AI,
 see: [--ogspv](/docs/OPTIONS-LIST.md/#ogspv)

## Community Involvement

- You may also use [Issues](https://github.com/online-go/gtp2ogs/issues)
 to report issues.
- Contributing is most welcome, if you want to add features or submit fixes
 we'd be glad to review them with you and make gtp2ogs more awesome!
- You may also be interested in joining the Discord chat:
 in leela zero's [#bots channel](https://discord.gg/HZ23Cp9)

This discord can also be useful if you want to have fast and quick,
 interactive chat, or ask simple and quick questions, however github issues
 are preferred for long problems because they leave a track that can be useful
 later)

## Developer Notes

You can find notes for developers [here](/docs/DEV.md).
