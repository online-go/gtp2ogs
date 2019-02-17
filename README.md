# gtp2ogs

[![Build Status](https://travis-ci.org/online-go/gtp2ogs.svg?branch=devel)](https://travis-ci.org/online-go/gtp2ogs)


This javascript tool allows Go bots that support GTP 
[(Go Text Protocol)](https://senseis.xmp.net/?GoTextProtocol) 
to communicate with OGS [(Online-Go.com Server)](https://online-go.com/)

No programming knowledge is needed to use it : just install it and it works.

Programming knowledge is needed only to add extra features such as displaying
and sending winrates and variations at every move, for example.

Note that some contributors already provide their custom gtp2ogs branches 
so you can download them directly or ask them if you want these features, 
see [custom branches](#custom-branches)

When you have a bot on OGS, you have total control over it : 
you put it online when you want only, and there are many settings to choose 
game settings to accept (rank, boardisze, correspondence games, etc..), but 
also options to control your GPU/computing device power spent (max number of 
simultaneous games, corrqueue, etc..)

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

### 3. Optional : install any missing node.js packages
 
**This step can be skipped unless you have issues or bugs**

you may need to install extra tools if the 
[Most common usage](https://github.com/wonderingabout/gtp2ogs/blob/clearer-devel/README.md#5-most-common-usage--start-gtp2ogsjs-using-nodejs) 
below fails, such as (run as `sudo` for linux, and as admin for windows)
 
```
npm install -g socket.io-client
npm install -g optimist
npm install -g tracer
  ```

### 4. Recommended : Upgrade to devel branch

This step is **is recommended**

By default, npm installs an old branch of gtp2ogs that does not include latest 
improvements, new features, and fixes

To upgrade to devel branch (newest), see :

- for linux : [3A3) Recommended : Upgrade gtp2ogs.js from old branch to “devel” branch (latest)](https://github.com/wonderingabout/gtp2ogs-tutorial/blob/master/docs/3A3-linux-optional-upgrade-to-devel.md)
- for windows : [3B3) Recommended : Upgrade gtp2ogs from old branch to devel (latest) branch](https://github.com/wonderingabout/gtp2ogs-tutorial/blob/master/docs/3B3-windows-optional-upgrade-to-devel.md)

When you upgrade you need to copy all the gtp2ogs files (bot.js, config.js, etc..) 
and overwrite the old files (you can backup your old files so that you can go back 
to the old version if you want later)

### 5. Most common usage : start gtp2ogs.js using nodejs

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
[OGS server](https://online-go.com/), add the `-- beta` argument

### Extra : add features by editing gtp2ogs files

This step is totally not needed but can be much appreciated

To do that, programming knowledge is needed (or you can ask for help)

However, some contributors freely provide their custom branches, see 
[custom branches](#custom-branches)

# Options

Before putting `<gtp2ogsarguments>`, you have to put these options first :

  ```--username``` Specify the username of the bot, for example `--username GnuGo`, 
currently there is no profile number log in support on ogs, see 
[notes A-](/docs/NOTES.md#a-) for details

  ```--apikey``` Specify the API key for the bot, for example `--apikey 5srvb5es4se7651741r61devr864re`

Then, the following options are placed in the above ```<gtp2ogsarguments>``` 
section. Put a space in between options when there are more than one.
Also put a space in between the option and the parameter, for example :

  ```--startupbuffer 2 --boardsize 13,19 --noclock --unrankedonly --maxconnectedgamesperuser 1 --maxmaintimelive 600 --maxperiodtimecorr 86400 --maxconnectedgames 10 --ban UserX,playerY ---maxperiodsranked 5```

**You can find a list of all possible to use gtp2ogs arguments here**

**[List of all Options](/docs/OPTIONS-LIST.md)**

(Since the list takes a lot of place, it has been moved on a separate page)

use the ones you want only, no need to use them all !

After that, add a ``` -- ``` (with one space before and one space after the `--` ), 
to separate `<gtp2ogsarguments>` from your bot path and `<botarguments>`, as 
shown in 
[Most common usage earlier](/docs/NOTES.md#5-most-common-usage--start-gtp2ogsjs-using-nodejs)

note : some gtp2ogsarguments have default so they are enabled even if you don't 
specify them, such as `--komi` which default is automatic even if you dont specify it !
(default value is overwritten when you set your own value)

note 2 : if an argument has ranked and unranked in the same "family", use:
- either the general argument alone,
- OR, if you want to specify different settings for ranked and unranked games, use 
both the ranked and the unranked argument with wanted values, and then don't use the 
general argument ! (see [notes H-](/docs/NOTES.md#h-) for details)

## Notes :

A page summarizing the notes and details about gtp2ogs use can be viewed [here](/docs/NOTES.md)

# Custom branches

Some branches add some nice features like 
**displaying variations (PV) ingame for Leela zero and PhoenixGo**

See [Custom Branches](/docs/CUSTOM-BRANCHES.md)

# Discord chat : 

if you're read that far, maybe you'll be interested to share your bot experience with 
bot admins or see talked topic !

come on the leela zero discord in `#bots` channel and follow the talk with everyone !

https://discord.gg/HZ23Cp9

This discord can also be useful if you want to have fast and quick, interactive chat !

You can also use the discord to ask simple and quick questions

However, if you have a problem and it needs some explanations and time, it is common 
github practices to use the ["Issues"](https://github.com/online-go/gtp2ogs/issues) 
forum instead

# Contributing

You like gtp2ogs and want to improve it ?

found a bugfix ?

want to add a new feature ?

Welcome !

come help us all make gtp2ogs more awesome than it already is ! 

Read Contributing instructions [here](/docs/CONTRIBUTING.md)

