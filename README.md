gtp2ogs
=======

This script allows Go bots that support GTP (Go Text Protocol) to communicate
with OGS (Online-Go.com Server)

Installation
============

  1. Use your systems package manager or otherwise install `node.js` from http://nodejs.org/
  2. Run
    ```
    npm install -g gtp2ogs
    ```
  3. Install any missing node.js packages if basic usage below fails, such as:
    ```
    npm install socket.io-client
    npm install optimist
    npm install tracer
    ```


Basic usage
===========

```
gtp2ogs --botid <id> --apikey <apikey> <arguments> -- <bot command> <bot arguments>
```
