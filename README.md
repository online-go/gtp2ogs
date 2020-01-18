# gtp2ogs

[![Build Status](https://travis-ci.org/online-go/gtp2ogs.svg?branch=devel)](https://travis-ci.org/online-go/gtp2ogs)


This javascript tool allows all bots/AI compatible with 
[GTP (Go Text Protocol)](https://senseis.xmp.net/?GoTextProtocol) 
to communicate with [OGS (Online-Go.com Server)](https://online-go.com/)

After being configured, gtp2ogs is ready to work as-is, 
but it is also possible to [customize](#extra--custom-branches) it.

Being a bot admin on OGS means :
- you can put your bot online whenever you want
- choose settings to automatically accept or reject challenges 
(example: rank, boardsize, blitz/live/correspondence, etc.), or to 
control your GPU/computing device power spent (max number of 
simultaneous games, corrqueue, etc.)
- choose your bot-specific options (for example `-v 1600` for leela-zero, 
etc.)

# Full tutorial 

[for windows and linux, with screenshots, examples, and detailed explanations](https://github.com/wonderingabout/gtp2ogs-tutorial)

# Quick Guide

### 1. install node.js and npm

To install nodejs, you can :
- either use your system package manager (like apt-get for ubuntu)
- or download it from [nodejs website downloads](https://nodejs.org/en/download/) 
for linux or windows

note : installing nodejs will also install npm = node package manager. Both 
will be needed later.

### 2. install gtp2ogs using npm

- For linux in terminal :

```
sudo npm install -g gtp2ogs
```

default path install is : 
> /usr/lib/node_modules/gtp2ogs/

- For windows, open a node.js command prompt as admin, then run this command :

```
npm install -g gtp2ogs
```

default path install is something like this :
> C:\Users\yourusername\AppData\Roaming\npm\node_modules\gtp2ogs\


On all operating systems, gtp2ogs will be installed in 2 different directories, but 
**the one that needs to be run with node is gtp2ogs.js in node_modules directory**

### 3. Recommended : Upgrade to devel branch

This step is **highly recommended**

By default, npm installs an old branch of gtp2ogs that does not include latest 
improvements, new features, and fixes

An easy way to upgrade is to copy all the devel gtp2ogs files and folders 
(bot.js, config.js, etc..) to the original directory where gtp2ogs is 
installed, and overwrite the old existing files 

note : before overwriting, you can backup your old files so that you can 
go back to the old branch of gtp2ogs anytime later if you want

Then it is needed to do the post install :

The command below will automatically detect all missing packages needed 
from the package.json of the new branch, and install all these packages

- for linux :

```
cd /usr/lib/node_modules/gtp2ogs/
sudo npm install
```

- for windows :

Open a node.js command prompt as admin, then :

```
pushd C:\Users\yourwindowsusername\AppData\Roaming\npm\node_modules\gtp2ogs\
npm install
```

For details or help, you can see :

- for linux : [3A3) Recommended : Upgrade gtp2ogs.js from old branch to “devel” branch (latest)](https://github.com/wonderingabout/gtp2ogs-tutorial/blob/master/docs/3A3-linux-optional-upgrade-to-devel.md)
- for windows : [3B3) Recommended : Upgrade gtp2ogs from old branch to devel (latest) branch](https://github.com/wonderingabout/gtp2ogs-tutorial/blob/master/docs/3B3-windows-optional-upgrade-to-devel.md)

### 4. Most common usage : start gtp2ogs.js using nodejs

For linux (preferably as sudo) :

```
node /usr/lib/node_modules/gtp2ogs/gtp2ogs.js --username <yourbotusername> --apikey <apikey> <gtp2ogsargument1> <gtp2ogsargument2> -- /replace/with/full/path/to/your/ai/runfile.file <botargument1> <botargument2>
```

For windows (preferably as admin) : 

```
pushd C:\Program Files\nodejs && node.exe C:\Users\yourwindowsusername\AppData\Roaming\npm\node_modules\gtp2ogs\gtp2ogs.js --username <yourbotusername> --apikey <apikey> <gtp2ogsargument1> <gtp2ogsargument2> -- C:\Users\path\to\your\ai\executable.exe <botargument1> <botargument2>
```

note : for all operating systems, in ` -- `, the spaces after `<gtp2ogsarguments>` 
and before `/path/to/your/bot.executable` are important : they separate gtp2ogs 
arguments from your bot arguments

note 2 : the number of <gtp2ogsarguments> and <botarguments> is not limited, 
here only 2 were shown but it possible to use for example 3,4,5 , or as many as 
you want
  
note 3 : to play on [beta OGS server](https://beta.online-go.com/) instead of the 
[OGS server](https://online-go.com/), add the `--beta` argument

# Options :

**You can find a list of all possible to use gtp2ogs arguments here**

**<<<<<<<<<< [List of all Options](/docs/OPTIONS-LIST.md) >>>>>>>>>>**


Before putting `<gtp2ogsarguments>`, you have to put the options [username](https://github.com/online-go/gtp2ogs/blob/devel/docs/OPTIONS-LIST.md#username) 
and [apikey](https://github.com/online-go/gtp2ogs/blob/devel/docs/OPTIONS-LIST.md#apikey) 
first.

Then, choose the wanted ```<gtp2ogsarguments>``` from the above [list of all options](/docs/OPTIONS-LIST.md) section (no need to use all these options, only the ones you want), 
and separate each option with a space

After that, add a ``` -- ``` (with one space before and one space after the `--` ), 
to separate `<gtp2ogsarguments>` from your bot path and `<botarguments>`, as 
shown in 
[Most common usage earlier](#4-most-common-usage--start-gtp2ogsjs-using-nodejs)

note : some gtp2ogsarguments have default so they are enabled even if you don't 
specify them.

# Example of use :

We are using the AI PhoenixGo on linux in this example, 
but it works the same way on other platforms and AI :

```sudo node /usr/lib/node_modules/gtp2ogs/gtp2ogs.js --beta --apikey 5rg46ze84f68e4g6v4e4g68es4g8 --username testbot --debug --startupbuffer 2 --bans 454,someplayer,489,512 --noclock --unrankedonly --maxconnectedgames 10 --maxconnectedgamesperuser 1 --minrank 5d --noautohandicapranked --maxhandicap 0 --fakerank 8d --boardsizes 19 --komis 7.5 --speeds live --maxmaintimelive 600 --maxperiodsliveranked 5 --maxperiodsliveunranked 10 --maxperiodtimeliveranked 60 --maxperiodtimeliveunranked 180 -- /home/amd2019/PhoenixGo/bazel-bin/mcts/mcts_main --gtp --config_path=/home/amd2019/PhoenixGo/etc/mcts_1gpu_beta.conf --v=1```

# Extra : Custom branches

Some branches add some not obligatory, but still nice features such as 
**displaying variations (PV) ingame for Leela zero and PhoenixGo** 

You may customize your gtp2ogs code by yourself if you have the programming 
knowledge.

However, some contributors freely provide their custom branches, see 
[Custom Branches](/docs/CUSTOM-BRANCHES.md) for details.

# Community Involvment

- You may be interested in [Contributing](/docs/CONTRIBUTING.md)

- You may also use [Issues](https://github.com/online-go/gtp2ogs/issues) 
to report issues.

- You may be interested in joining the Discord chat : 
In leela zero discord (`#bots` channel) : https://discord.gg/HZ23Cp9

This discord can also be useful if you want to have fast and quick, 
interactive chat, or ask simple and quick questions (github Issues are 
preferred for long problems because they live a track that can be useful 
later) !
