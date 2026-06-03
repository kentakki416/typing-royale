/**
 * Node 向け共通 ESLint 設定 (packages/* で使用)
 *
 * 各パッケージは以下のいずれかで利用する:
 *   module.exports = require("@repo/eslint-config")
 *
 * 追加で ignore したいパス等がある場合:
 *   const baseConfig = require("@repo/eslint-config")
 *   module.exports = [...baseConfig, { ignores: ["generated/**"] }]
 */
const { defineConfig } = require("eslint/config")
const typescriptEslint = require("@typescript-eslint/eslint-plugin")
const typescriptParser = require("@typescript-eslint/parser")
const importPlugin = require("eslint-plugin-import")

module.exports = defineConfig([
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2020,
        project: "./tsconfig.json",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": typescriptEslint,
      import: importPlugin,
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        },
      },
    },
    rules: {
      /** インデント */
      indent: ["error", 2],

      /** Console */
      "no-console": ["warn", { allow: ["warn", "error"] }],

      /** 未使用変数 */
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],

      /** コードスタイル */
      "object-curly-spacing": ["error", "always"],
      quotes: ["error", "double"],
      semi: ["error", "never"],
      "no-multiple-empty-lines": ["error", { max: 1, maxBOF: 0, maxEOF: 0 }],
      "padded-blocks": ["error", "never"],
      "no-trailing-spaces": "error",
      "no-multi-spaces": "error",

      /** Import 順序 */
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
          pathGroups: [
            {
              pattern: "@repo/**",
              group: "internal",
              position: "before",
            },
          ],
          pathGroupsExcludedImportTypes: ["builtin"],
        },
      ],
      "import/no-duplicates": ["error", { "prefer-inline": true }],

      /** TypeScript: 型安全性 */
      "@typescript-eslint/no-empty-function": "error",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/promise-function-async": "warn",

      /** TypeScript: 命名規則 */
      "@typescript-eslint/naming-convention": [
        "error",
        {
          format: ["camelCase", "UPPER_CASE", "PascalCase"],
          selector: "variable",
        },
        {
          format: ["camelCase", "PascalCase"],
          selector: "function",
        },
        {
          format: ["PascalCase"],
          selector: "typeLike",
        },
      ],

      /** コード品質 */
      eqeqeq: ["error", "always"],
      "no-return-await": "error",
      "no-unneeded-ternary": "error",
      "no-var": "error",
      "prefer-arrow-callback": "error",
      "prefer-const": "error",
      "prefer-template": "error",
    },
  },
  {
    ignores: ["node_modules/**", "dist/**"],
  },
])
