gtp2ogs
=======

This script allows Go bots that support GTP (Go Text Protocol) to communicate
with OGS (Online-Go.com Server)

Installation
============

  1. Use your systems package manager or otherwise install `node.js` from http://nodejs.org/
  2. Install any missing node.js packages, such as:
    ```
    npm install optimist
    npm install socket.io-client
    ```
  3. Run
    ```
    npm install -g gtp2ogs
    ```


Basic usage
===========

```
gtp2ogs --botid <id> --apikey <apikey> <arguments> -- <bot command> <bot arguments>
```
