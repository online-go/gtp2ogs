# Linux support

This tutorial uses Ubuntu 20.04.

Unless specified otherwise, all linux distributions are supported.

## 1. install node.js and npm

It is recommend to use [nvm (Node Version Manager)](https://github.com/nvm-sh/nvm#install--update-script).

For example:

```Shell
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash
```

note: in the past we used to use `apt` for these instructions, but on ubuntu 20.04 the default
 package provided is outdated, plus install nodejs latest version from node.js's github then `apt`
 creates dependencies conflicts.

Then update your shell environment (for example with Ubuntu 20.04 in this example):

```Shell
source ~/.profile
```

Display available versions to install:

```Shell
nvm ls-remote
```

Install the node version you want, for example to install node 14.2.0.0:

```Shell
nvm install 14.2.0
```

see for details [the full tutorial's linux node install page](https://github.com/wonderingabout/gtp2ogs-tutorial/blob/master/docs/3A1-linux-download-install-nodejs.md).

## 2. install gtp2ogs using npm

Install gtp2ogs locally, for example at the root of you user account.

```Shell
git clone -b devel https://github.com/online-go/gtp2ogs && cd gtp2ogs && npm install
```

note: here we are installing devel, the "develop" branch because it has latest
 improvements and fixes. However devel is a "beta" branch which may be unstable
 or contain bugs. If you prefer, you can install other more stable branches instead.

note 2: if you're a developer, you most likely would want to use your own fork rather
 to be able to checkout easily and do other branch manipulations. To do that simply
 replace `online-go` with your github name.

gtp2ogs will be installed in `~/gtp2ogs/`.

In the future, if you want to update your branch, remember to finalize the update process
 with the command `npm install` locally, which will install all new dependencies.

For developers, see also [here](/docs/DEV.md).
