Below is a list of the main KNOWN bugs, issues, and other problems with 
the current latest branch : 

All issues can be viewed in [Issues](https://github.com/online-go/gtp2ogs/issues), 
but this page summarizes the most common ones or critical ones

### 1) automatic handicap bypass min-max handicap limits

when "automatic handicap" is selected by the user, the user can play a 
handicap game even if `--minhandicap` and/or `--maxhandicap` are used

such a game will have n handicap stones, where n is the rank difference 
between both players

A possible workaround is to use `--noautohandicap` which will disable 
automatic handicap games

### 2) 404 Challenge does not exist

This is a common and very old "bug", some may say it's even a feature 
if we were to joke

This error does not prevent gtp2ogs from functionning, so it has been 
given low priority to fix

Also, sometimes the challenge error loops, because gtp2ogs does not 
delete the challenge, for some reason

See [Issues](https://github.com/online-go/gtp2ogs/issues) for details
