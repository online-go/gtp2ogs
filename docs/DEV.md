# DEV

This file contains notes only for developers.

## About npm

node_modules is gitignored.

It is good practice to commit package-lock.json, so this is what we do here in gtp2ogs.
 This is so that everyone who runs `npm install` gets the same version of the packages
 we use. That way we can test the same packages as they use, and avoid unexpected
 incompatibilities.

## Links

With visual studio code, the following extensions can be downloaded here:

- ESLint: <https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint>
- markdownlint: <https://marketplace.visualstudio.com/items?itemName=DavidAnson.vscode-markdownlint>

## Doc

You can find information about the OGS API here:

- <https://ogs.readme.io/docs/real-time-api>
- <https://ogs.docs.apiary.io/#>
- <https://forums.online-go.com/t/ogs-api-notes/17136>

And more general OGS documentation here:

- <https://github.com/online-go/online-go.com#utilizing-the-website>
