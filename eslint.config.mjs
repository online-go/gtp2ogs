import jsdoc from "eslint-plugin-jsdoc";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import prettier from "eslint-plugin-prettier";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import stylistic from "@stylistic/eslint-plugin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

export default [
    ...compat.extends("eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"),
    {
        plugins: {
            jsdoc,
            "@typescript-eslint": typescriptEslint,
            "@stylistic": stylistic,
            prettier,
        },

        languageOptions: {
            globals: {
                ...globals.browser,
            },

            parser: tsParser,
            ecmaVersion: 5,
            sourceType: "module",

            parserOptions: {
                project: "tsconfig.json",
            },
        },

        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/adjacent-overload-signatures": "error",
            "@typescript-eslint/consistent-type-assertions": "error",
            //"@typescript-eslint/member-delimiter-style": "error",
            "@stylistic/member-delimiter-style": "error",
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
            "@stylistic/semi": "error",
            "@stylistic/type-annotation-spacing": "error",
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

            "prefer-arrow-callback": [
                "error",
                {
                    allowNamedFunctions: true,
                },
            ],

            "prettier/prettier": "error",
            "use-isnan": "error",

            "prefer-const": [
                "error",
                {
                    destructuring: "all",
                },
            ],
        },
    },
    {
        files: ["**/*.test.ts", "**/*.test.tsx"],

        languageOptions: {
            ecmaVersion: 5,
            sourceType: "script",

            parserOptions: {
                project: null,
            },
        },

        rules: {
            "@typescript-eslint/no-floating-promises": "off",
        },
    },
];
