module.exports = {
    env: {
        browser: true,
        es6: true,
    },
    parser: "@typescript-eslint/parser",
    parserOptions: {
        project: "tsconfig.json",
        sourceType: "module",
    },
    plugins: [
        "eslint-plugin-jsdoc",
        "@typescript-eslint",
        "@typescript-eslint/tslint",
        "prettier",
    ],
    extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
    rules: {
        // Recommended rules with errors
        // TODO: Fix these and re-enable them

        "@typescript-eslint/ban-types": "off",
        "@typescript-eslint/explicit-module-boundary-types": "off",
        "@typescript-eslint/no-empty-interface": "off",
        "@typescript-eslint/no-empty-function": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-namespace": "off",
        "@typescript-eslint/no-this-alias": "off",
        "@typescript-eslint/triple-slash-reference": "off",

        "no-misleading-character-class": "off",
        "no-prototype-builtins": "off",
        "no-self-assign": "off",
        "no-useless-escape": "off",
        "prefer-spread": "off",

        //==============================================================

        "@typescript-eslint/adjacent-overload-signatures": "error",
        "@typescript-eslint/consistent-type-assertions": "error",
        "@typescript-eslint/member-delimiter-style": "error",
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-inferrable-types": [
            "error",
            {
                ignoreParameters: true,
                ignoreProperties: true,
            },
        ],
        "@typescript-eslint/no-unused-vars": [
            "error",
            {
                varsIgnorePattern: "^_[a-zA-Z_]",
                argsIgnorePattern: "^_[a-zA-Z_]",
            },
        ],
        "@typescript-eslint/no-var-requires": "error",
        "@typescript-eslint/prefer-namespace-keyword": "error",
        "@typescript-eslint/semi": "error",
        "@typescript-eslint/type-annotation-spacing": "error",
        "computed-property-spacing": ["error", "never"],
        curly: "error",
        "eol-last": "error",
        eqeqeq: ["error", "smart"],
        "id-denylist": [
            "error",
            "any",
            "Number",
            "number",
            "String",
            "string",
            "Boolean",
            "boolean",
            "Undefined",
            "undefined",
        ],
        "id-match": "error",
        "jsdoc/check-alignment": "error",
        "jsdoc/require-asterisk-prefix": "error",
        "linebreak-style": ["error", "unix"],
        "no-caller": "error",
        "no-cond-assign": "error",
        "no-debugger": "error",
        "no-eval": "error",
        "no-fallthrough": [
            "error",
            {
                commentPattern: "break[\\s\\w]*omitted",
            },
        ],
        // Using the typescript-eslint version of this rule because of class
        // properties, which are not yet supported in ESLint.  For more info,
        // see: https://github.com/typescript-eslint/typescript-eslint/issues/491
        "@typescript-eslint/no-invalid-this": "error",
        "no-multiple-empty-lines": [
            "error",
            {
                max: 3,
            },
        ],
        "no-new-wrappers": "error",
        "no-tabs": "error",
        "no-trailing-spaces": "error",
        "no-undef-init": "error",
        "no-unsafe-finally": "error",
        "no-unused-labels": "error",
        "no-var": "error",
        "one-var": ["error", "never"],
        "prefer-arrow-callback": ["error", { allowNamedFunctions: true }],
        "prettier/prettier": "error",
        "use-isnan": "error",
        "@typescript-eslint/tslint/config": [
            "error",
            {
                rules: {
                    "import-spacing": true,
                    whitespace: [
                        true,
                        "check-branch",
                        "check-decl",
                        "check-operator",
                        "check-separator",
                    ],
                },
            },
        ],
        "prefer-const": [
            "error",
            {
                destructuring: "all",
            },
        ],
    },
    overrides: [
        {
            files: ["*.test.ts", "*.test.tsx"],
            // since test files are not part of tsconfig.json,
            // parserOptions.project must be unset
            parserOptions: {
                project: null,
            },
            rules: {
                // rules that depend on type information (and therefore
                // parserOptions.project)
                "@typescript-eslint/no-floating-promises": "off",
                "@typescript-eslint/tslint/config": "off",
            },
        },
    ],
};
