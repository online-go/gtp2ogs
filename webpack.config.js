const path = require("path");
var webpack = require('webpack');
let fs = require("fs");

var node_modules = fs.readdirSync("node_modules").filter(function (x) {
    return x !== ".bin";
});

var node_modules = {};
fs.readdirSync("node_modules")
    .filter(function (x) {
        return [".bin"].indexOf(x) === -1;
    })
    .forEach(function (mod) {
        if (mod !== "goban") {
            node_modules[mod] = "commonjs " + mod;
        }
    });

module.exports = (_env, _argv) => {
    let ret = {
        mode: "development",

        entry: {
            gtp2ogs: "./src/main.ts",
        },
        resolve: {
            modules: ["src", "schema", "node_modules"],
            extensions: [".webpack.js", ".web.js", ".ts", ".tsx", ".js"],
        },
        output: {
            path: path.join(__dirname, "dist"),
            filename: "[name].js",
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: [
                        {
                            loader: "ts-loader",
                            options: {
                                transpileOnly: false,
                                happyPackMode: false,
                                allowTsInNodeModules: true,
                            },
                        },
                    ],
                },
                {
                    test: /\.node$/,
                    loader: "node-loader",
                },
            ],
        },

        devtool: "inline-source-map",

        performance: {
            maxAssetSize: 1024 * 1024 * 5.5,
            maxEntrypointSize: 1024 * 1024 * 5.5,
        },

        target: "node",
        externals: node_modules,
        plugins: [
            new webpack.BannerPlugin({
                banner: (banner) => {
                    return `#!/usr/bin/env node\nrequire("source-map-support/register");\n`;
                    //return `#!/usr/bin/env node\n`;
                },
                raw: true,
                entryOnly: false,
            }),
        ],
        optimization: {
            removeAvailableModules: false,
            removeEmptyChunks: false,
            splitChunks: false,
        },
    };

    return ret;
};
