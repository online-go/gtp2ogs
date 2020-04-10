Some custom branches are very helpful for gtp2ogs, but they are not implemented 
in the official gtp2ogs because it would add extra maintainance to maintain them

# How to test a custom gtp2ogs branch

To use them, just replace your current gtp2ogs files with the branch's file

It is in fact the same methodology than for upgrading to devel, except that you 
upgrade to another custom branch from another owner

Refer to the general steps here : 
[3. Recommended : Upgrade to devel branch](/README.md/#3-recommended--upgrade-to-devel-branch)

except that you have to replace `-b devel online-go/gtp2ogs` with 
`-b custombranchname customowner`

If it is not clear, you can also see the gtp2ogs full tutorial, except that 
you have to download the custom branch ZIP instead of the devel branch : 
- for linux : [3A3) Recommended : Upgrade gtp2ogs.js from old branch to “devel” branch (latest)](https://github.com/wonderingabout/gtp2ogs-tutorial/blob/master/docs/3A3-linux-optional-upgrade-to-devel.md)
- for windows : [3B3) Recommended : Upgrade gtp2ogs from old branch to devel (latest) branch](https://github.com/wonderingabout/gtp2ogs-tutorial/blob/master/docs/3B3-windows-optional-upgrade-to-devel.md)

Below are the most notable custom branches freely available : 

## roy7/roy7-live branch :  

it adds the ability to display PV (variations) of Leela Zero even with pondering 
unlike dorus's branch, and has other options that may not be needed

however currently it is using an old version of gtp2ogs, stay tuned to see when it 
is updated

Here is an example of game using it for PhoenixGo (RoyalZero) : 
https://online-go.com/game/16512137

You can download it here (download ZIP) : 

https://github.com/roy7/gtp2ogs/tree/live
