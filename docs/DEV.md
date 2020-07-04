# DEV

This file contains notes only for developers.

## About npm

node_modules is gitignored.

It is good practice to commit package-lock.json, so this is what we do here in gtp2ogs.
 This is so that everyone who runs `npm install` gets the same version of the packages
 we use. That way we can test the same packages as they use, and avoid unexpected
 incompatibilities.

## request any user information from OGS termination API with HTTP GET

On any web browser or compatible environment (including node.js), it is possible to query
any user information with a GET

As @anoek explained a few years ago, that information will come to you in some responses
from the socket.io API, but there isn’t a query in the socket.io interface for that explicitly.

Instead, do a HTTP GET <https://online-go.com/termination-api/players?ids=IDS> where `IDS` is
a period separated list of user id’s

example: <https://online-go.com/termination-api/players?ids=1.419331.790237>

`[{"id":1,"country":"us","username":"anoek","icon-url":"https://b0c2ddc39d13e1c0ddad-93a52a5bc9e7cc06050c1a999beb3694.ssl.cf1.rackcdn.com/09ea48b349cad5d5f27e07f5e0177803-32.png","ui_class":"supporter moderator admin","ratings":{"overall":{"deviation":135.67,"rating":1480.65,"volatility":0.059667}},"rating":1480.647,"ranking":17,"pro":0,"online":1},`

`{"id":419331,"country":"us","username":"RoyalLeela","icon-url":"https://b0c2ddc39d13e1c0ddad-93a52a5bc9e7cc06050c1a999beb3694.ssl.cf1.rackcdn.com/8c28d578d14aa990796bcbbd59aa170c-32.png","ui_class":"bot","ratings":{"overall":{"deviation":75.99,"rating":2571.06,"volatility":0.06752}},"rating":2571.0588232230043,"ranking":34.58864803221507,"pro":0,"online":0},`

`{"id":790237,"country":"un","username":"ShushanHarutiunian","icon-url":"https://secure.gravatar.com/avatar/52d56297994d979ba620968d249eab5a?s=32&d=retro","ui_class":"provisional","ratings":{"overall":{"deviation":220.9,"rating":1669.99,"volatility":0.059985}},"rating":1669.988354466786,"ranking":21.10423695402945,"pro":0,"online":0}]`

We also get almost all this information in notification from connection.js

## request list of all bots registered on OGS

See: <https://online-go.com/api/v1/ui/config>

This also displays personal OGS user information of the currently logged in user
to OGS website on the current web browser (on a private window or different
browser not logged in to OGS, account displayed will be `anonymous`).

## no-console ESLint rule in config.js

Since we use console for displaying information to our user (the botadmin), it is a valid
case where we should disable the no-console rule of ESLint.

details [here](https://eslint.org/docs/rules/no-console#when-not-to-use-it).

## no console import in config.js

In config.js the purpose of console logging is different, we warn bot admin of any error
in argv and values, and if any is found (ex: --minrank 157f), it is best to `throw` an error
and terminate all the gtp2ogs program.

`throw` provides all the information we need so only the basic `console` with its method
`console.log` is enough, no need for our customized console in console.js.

However in other files one time errors in one game is not a reason to exit all our gtp2ogs
program when all other games are running fine, so we add instead a beautified logging error
using our custom console.js. This beuatified error will be useful for future reference.

## Links

With visual studio code, the following extensions can be downloaded here:

- ESLint: <https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint>
- markdownlint: <https://marketplace.visualstudio.com/items?itemName=DavidAnson.vscode-markdownlint>

These additional visual studio code extensions are also convenient for testing:

- Test Explorer UI: <https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer>
- Mocha Test Explorer: <https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-mocha-test-adapter>
- Code Coverage Highlighter: <https://marketplace.visualstudio.com/items?itemName=brainfit.vscode-coverage-highlighter>

## Doc

You can find information about the OGS API here:

- <https://ogs.readme.io/docs/real-time-api>
- <https://ogs.docs.apiary.io/#>
- <https://forums.online-go.com/t/ogs-api-notes/17136>

And more general OGS documentation here:

- <https://github.com/online-go/online-go.com#utilizing-the-website>
