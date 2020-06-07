# DEV

This file contains notes only for developers.

## About npm

node_modules is gitignored.

It is good practice to commit package-lock.json, so this is what we do here in gtp2ogs.
 This is so that everyone who runs `npm install` gets the same version of the packages
 we use. That way we can test the same packages as they use, and avoid unexpected
 incompatibilities.

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
