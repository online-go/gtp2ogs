gtp2ogs
=======

This script allows Go bots that support GTP (Go Text Protocol) to communicate
with OGS (Online-Go.com Server)

Installation
============

  1. Use your systems package manager or otherwise install `node.js` from http://nodejs.org/
  2. Go to the directory where gtp2ogs.js and package.json are placed
  3. Run
    ```
    npm install gtp2ogs
    ```


Basic usage
===========

```
gtp2ogs --botid <id> --apikey <apikey> [options] -- <bot command> [bot arguments]
```

Options
==========

Options are:
-ggs-host (default: ggs.online-go.com)
-ggs-port (default: 443)
-resthost (default: online-go.com)
-restport (default: 443)
-mintime (default: 30)  --seconds per move, maintime minimum is multiples of mintime
-maxtime (default: 300)  --seconds per move, maintime max is multiples of maxtime
-abuser1 through -abuser6  (default: none)  --usernames for the bot to refuse challenge
-insecure (default: false)  --connect to ggs and rest servers without https: on port 80
-insecureggs (default: false)  --connect to ggs server without https: (SSL) on port 80
-insecurerest (default: false)  --connect to rest server without https: (SSL) on port 80
-beta (default: false)  --connect to the beta ggs and rest servers
-debug (default: false)  --display GTP commands and bot responses on the shell
