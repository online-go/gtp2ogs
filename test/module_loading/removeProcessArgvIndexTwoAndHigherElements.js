function removeProcessArgvIndexTwoAndHigherElements() {
    // remove extra object {} at index 2 (and more if there are any)
    // on real gtp2ogs run process.argv only has 2 elements,
    // but on tests there is a 3rd element (empty object {} which should
    // not be needed and make test fail),
    // ['/home/amd2020/.nvm/versions/node/v14.2.0/bin/node', '/home/amd2020/.vscode/extensions/hbenl.vscode-mocha-test-adapter-2.6.2/out/worker/bundle.js', '{}']
    // so remove it
    process.argv = process.argv.slice(0,2);
}

exports.removeProcessArgvIndexTwoAndHigherElements = removeProcessArgvIndexTwoAndHigherElements;
