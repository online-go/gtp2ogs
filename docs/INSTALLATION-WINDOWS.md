# Windows Guide

Unless specified otherwise, all windows distributions are supported.

## 1. install node.js and npm

Download node.js from [nodejs website downloads](https://nodejs.org/en/download/)

Install like any other installer executable.

## 2. install gtp2ogs with npm

Install gtp2ogs locally, for example at the root of you user account folder. There are
 two ways to do it, choose the easiest for you:

note: in both cases, here we are installing devel, the "develop" branch because it has latest
 improvements and fixes. However devel is a "beta" branch which may be unstable
 or contain bugs. If you prefer, you can install other more stable branches instead.

### 2a. if you're a novice user: download ZIP

Go to [gtp2ogs's github website, devel branch](https://github.com/online-go/gtp2ogs/tree/devel).
 On the top right, click on the "Clone or download" button", then click on "Download ZIP".

Then, extract this archive at the root of your home folder, gtp2ogs is in `C:\Users\yourusername\gtp2ogs\`

Finally, install all the node_modules in gtp2ogs folder. To do that, press "Start Menu", type "node",
 then click on "open a node.js command prompt". In that command prompt, go inside the folder and
 install node_modules:

```Shell
pushd C:\Users\yourusername\gtp2ogs && npm install
```

You will have a new folder node_modules, and a new file package-lock.json.

### 2b. if you're a developper or experienced user: use git

If you don't already have git, you'll have to install it. You can download git [here](https://git-scm.com/downloads)

Then press "Start Menu", type "node", then click on "open a node.js command prompt".
 Install gtp2ogs locally, at the root of you user account folder:

```Shell
git clone -b devel https://github.com/online-go/gtp2ogs && cd gtp2ogs && npm install
```

gtp2ogs will be installed in `C:\Users\yourusername\gtp2ogs\`

In the future, if you want to update your branch, remember to finalize the update process
 with the command `npm install` locally, which will install all new dependencies.

See also [here](/docs/DEV.md).
