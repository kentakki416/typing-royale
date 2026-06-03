const { defineConfig } = require('eslint/config')
const typescriptEslint = require('@typescript-eslint/eslint-plugin')
const typescriptParser = require('@typescript-eslint/parser')
const importPlugin = require('eslint-plugin-import')
const vitestPlugin = require('@vitest/eslint-plugin')

module.exports = defineConfig([
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2020,
        project: './tsconfig.json',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
      },
    },
    rules: {
      "indent": ["error", 2], // インデントを2スペースに統一（タブも2スペースに変換）
      // === Console ===
      'no-console': ['warn', { allow: ['warn', 'error'] }], // console.log は警告、warn/error は許可

      // === 未使用変数 ===
      '@typescript-eslint/no-unused-vars': ['warn', {
        args: 'after-used',           // 使われていない引数を検出
        argsIgnorePattern: '^_',      // _で始まる引数は除外
        varsIgnorePattern: '^_',      // _で始まる変数は除外
        ignoreRestSiblings: true,     // 分割代入の残余は除外
      }],

      // === コードスタイル ===
      'object-curly-spacing': ['error', 'always'],  // { foo } のようにスペースを入れる
      'quotes': ['error', 'double'],                 // ダブルクォートを強制
      'semi': ['error', 'never'],                   // セミコロンを禁止
      'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0, maxBOF: 0 }], // 連続する空行は最大1行、ファイルの先頭/末尾は0行
      'padded-blocks': ['error', 'never'], // ブロックの開始/終了での空行を禁止
      'no-trailing-spaces': 'error', // 行末のスペースを禁止
      'no-multi-spaces': 'error', // コードの途中で連続するスペースを禁止

      // === Import順序 ===
      'import/order': [
        'error',
        {
          groups: [
            'builtin',   // Node.jsの組み込みモジュール（例: fs, path）
            'external',  // 外部ライブラリ（node_modules）
            'internal',  // 内部モジュール（@repo/など）
            'parent',    // 親ディレクトリからのインポート
            'sibling',  // 同じディレクトリまたは兄弟ディレクトリからのインポート
            'index',    // カレントディレクトリのindexファイル
          ],
          'newlines-between': 'always', // グループ間に改行を挿入
          alphabetize: {
            order: 'asc', // 各グループ内でアルファベット順にソート
            caseInsensitive: true, // 大文字小文字を区別しない
          },
          pathGroups: [
            {
              pattern: '@repo/**',
              group: 'internal',
              position: 'before',
            },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
        },
      ],
      'import/no-duplicates': ['error', { 'prefer-inline': true }], // 同じソースからの重複importを禁止、inline type importを推奨

      // === TypeScript: 型安全性 ===
      '@typescript-eslint/no-empty-function': 'error',                 // 空の関数を禁止
      '@typescript-eslint/no-explicit-any': 'warn',                    // any型は警告
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',     // 不要な型アサーションを禁止
      '@typescript-eslint/promise-function-async': 'warn',             // Promiseを返す関数はasyncに

      // === TypeScript: 命名規則 ===
      '@typescript-eslint/naming-convention': [
        'error',
        {
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],  // 変数: camelCase, UPPER_CASE, PascalCase
          selector: 'variable',
        },
        {
          format: ['camelCase', 'PascalCase'],                 // 関数: camelCase, PascalCase
          selector: 'function',
        },
        {
          format: ['PascalCase'],                              // 型: PascalCase
          selector: 'typeLike',
        },
      ],

      // === コード品質: 比較と構文 ===
      'eqeqeq': ['error', 'always'],           // === と !== を強制（== と != を禁止）
      'no-return-await': 'error',              // 不要な return await を禁止
      'no-unneeded-ternary': 'error',          // 不要な三項演算子を禁止（例: x ? true : false → x）
      'no-var': 'error',                       // var を禁止（const/let を使用）
      'prefer-arrow-callback': 'error',        // コールバック関数はアロー関数にする
      'prefer-const': 'error',                 // 再代入しない変数は const にする
      'prefer-template': 'error',              // 文字列結合ではなくテンプレートリテラルを使用
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'src/prisma/generated/**'],
  },
  {
    files: ['test/**/*.ts'],
    plugins: {
      vitest: vitestPlugin,
    },
    rules: {
      'vitest/expect-expect': 'error',
      'vitest/no-disabled-tests': 'warn',
      'vitest/no-focused-tests': 'error',
      'vitest/valid-expect': 'error',
    },
  },
])
