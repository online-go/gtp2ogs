# gtp2ogs

Gtp2ogs is a tool allows AI Go engines (bots) that support
[GTP (Go Text Protocol)](https://senseis.xmp.net/?GoTextProtocol)
to communicate with [OGS (Online-Go.com Server)](https://online-go.com/)
and play games with players or other bots.

# Quick start guide

## Obtaining an API key

Before you get started you'll need to setup a bot account on online-go.com. To
do that, you'll need to have your human account and create a new separate
account for your bot account, then contact a moderator to request that your bot
account be flagged as a bot account. Give them both your human account and your
bot account. Once that has been done, log in with your human account, search
for your bot account to view the bot profile, on that page you'll be able to
generate an API key which you'll use to connect the bot.

## Downloading and running gtp2ogs

### Using pre-built releases

To get started quickly, you can download a pre-built executable for Windows, Mac, and Linux
from the [releases](https:////github.com/online-go/gtp2ogs/releases) page.

### Using the node.js package

If you have [node.js](https://nodejs.org/) installed you can install the `gtp2ogs` package
using npm

```
npm install -g gtp2ogs
```

### Building from source

To build from source you will need to have `node.js` installed on your system.
You will also need to have the `yarn` and `gulp` npm packages installed. Once
you have the prerequisites you can run `yarn` to install the package dependencies,
and

```
gulp
```

to run the build process. The resulting compiled javascript file will be located
in `dist/gtp2ogs.js` which you can then run with

```
node dist/gtp2ogs.js
```

## Running your bot

Once you have your API Key and `gtp2ogs` installed, you can connect your bot to OGS
like so:

```
gtp2ogs --apikey YOURKEYHERE -- /path/to/your/bot --arguments --to your bot
```

Note that everything after the `--` will be considered a command used to run your
bot, so any gtp2ogs arguments you use needs to come before the `--`.

For more advanced configuration, see the `example_config.json5` for a configuration
template, and pass in the `--config yourconfig.json5` argument to `gtp2ogs`.

## Connecting to the beta server

If you'd like to connect your bot to the beta.online-go.com site simply follow all of the
previous steps for setting up a bot account on the beta site and use the `--beta` command
line argument.

# Community Involvement

-   Use [Issues](https://github.com/online-go/gtp2ogs/issues) to report issues.
-   You may be interested in the [Computer Go Community discord server](https://discord.gg/HZ23Cp9).
    Here you will find many people interested in developing bots, as well as
    the `gtp2ogs-dev` discord channel specifically for this project.
