Some custom branches are very helpful for gtp2ogs, but they are not implemented 
in the official gtp2ogs because it would add extra maintainance to maintain them

To use them, just replace your current gtp2ogs files with the branche's file, 
as explained in the gtp2ogs full tutorial, except that you have to download the 
custom branch ZIP instead of the devel branch : 
- for linux : [3A3) Recommended : Upgrade gtp2ogs.js from old branch to “devel” branch (latest)](https://github.com/wonderingabout/gtp2ogs-tutorial/blob/master/docs/3A3-linux-optional-upgrade-to-devel.md)
- for windows : [3B3) Recommended : Upgrade gtp2ogs from old branch to devel (latest) branch](https://github.com/wonderingabout/gtp2ogs-tutorial/blob/master/docs/3B3-windows-optional-upgrade-to-devel.md)

Below are the most notable custom branches freely available : 

## Dorus/dorus branch :

This branch has 2 main features : 

- 1) it adds the ability to display PV (variations) of Leela Zero and PhoenixGo

Here is an example of game using it for PhoenixGo (meta-金毛测试-20b) : 
https://online-go.com/game/16510570

Here is an example of game using it for LeelaZero-ELF (NightlyLeela) : 
https://online-go.com/game/16097813

Here is an example of game using it for LeelaZero-15b (15bTurboLeela) : 
https://online-go.com/game/16511596

To use it, you have to add the gtp2ogs argument `--logogspv LZ` if your bot is 
leela zero or a leela zero variant, or `--logogspv PG` if you bot is the native 
PhoenixGo

- 2) This branch also comes with "gears" settings to play faster when 
winrate of your leela zero bot (or variants) is above X% winrate

This is very useful to keep lost games to needlessly consume a lot of time

This is how it works : 

- gear 0 : no need to do anything, it's the default specified bot speed 
(seconds/move)

- gear 1 (max 10 seconds per move at X% winrate) : if you add the gtp2ogs 
argument `--fast1 X`, for example `--fast1 90` it means the bot will play 
at maximum 10 seconds per move if winrate is higher than 90% in that example

- gear 2 (max 1 second per move at X% winrate) : if you add the gtp2ogs 
argument `--fast2 X`, for example `--fast2 95` it means the bot will play 
at maximum 1 second per move if winrate is higher than 95% in that example

it is possible to combine both gears and have the bot play, in that example, 
using `--fast1 90 --fast2 95` :
- at gear 0 (default speed, no need to add any argument) if winrate is <90% 
- at gear 1 (10s per move) if winrate is >90% but <95%
- at gear 2 (1s per move) if winrate is >= 95%

You can download this custom branch here (download ZIP) : 

https://github.com/Dorus/gtp2ogs/tree/dorus

Note : currently, dorus's branch does not support pondering yet (need to disable 
it)

Note 2 : You need to install split2 to use this branch.

To do that, you can just run (as admin on windows, as sudo on linux) :

```npm install```

This command will automatically detect all missing packages needed 
from package.json and install them

## roy7/roy7-live branch :  

it adds the ability to display PV (variations) of Leela Zero even with pondering 
unlike dorus's branch, and has other options that may not be needed

however currently it is using an old version of gtp2ogs, stay tuned to see when it 
is updated

Here is an example of game using it for PhoenixGo (RoyalZero) : 
https://online-go.com/game/16512137

You can download it here (download ZIP) : 

https://github.com/roy7/gtp2ogs/tree/live
