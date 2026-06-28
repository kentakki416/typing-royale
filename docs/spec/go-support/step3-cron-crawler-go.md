# step3: Go 用クローラ task + GithubClient 除外パターン注入

Go の問題プールを埋める週次クローラ task を追加する。step2 の `GoFunctionExtractor` を DI し、`GithubClient` には Go 向けの拡張子・除外パターンを渡す。

## 対応内容

### `apps/cron/src/client/github/client.ts`（除外パターンを注入式に）

`EXCLUDED_TREE_PATTERNS` をデフォルト値として残しつつ、コンストラクタで上書きできるようにする（後方互換）。

```ts
export type GithubClientConfig = {
  // ...既存フィールド
  /** listSourceFiles の除外パスパターン。省略時は現行の JS/TS 向けデフォルト */
  excludedPathPatterns?: RegExp[]
}

// constructor
this.excludedPathPatterns = config.excludedPathPatterns ?? DEFAULT_EXCLUDED_TREE_PATTERNS

// listSourceFiles 内
.filter((e) => !this.excludedPathPatterns.some((p) => p.test(e.path)))
```

現行の `EXCLUDED_TREE_PATTERNS` を `DEFAULT_EXCLUDED_TREE_PATTERNS` にリネームしてエクスポートし、TS / JS task は引数を渡さず従来どおり動かす。

### `apps/cron/src/task/crawler-run-go.ts`（新規）

`crawler-run-typescript.ts` を雛形に、Go 用の定数・extractor・拡張子・除外パターンを与える。

```ts
const LANGUAGE_SLUG = "go"
const RUN_TYPE = "crawler_go"
const TASK_NAME = "crawler-run-go"

const GO_EXCLUDED_PATTERNS = [
  /^vendor\//, /\/vendor\//,
  /_test\.go$/,
  /\.pb\.go$/, /_gen\.go$/,
  /^(testdata|examples?)\//, /\/(testdata|examples?)\//,
]

runAsCrawlerJob({
  exec: async ({ prisma, runId, signal }) => {
    const github = new GithubClient({
      excludedPathPatterns: GO_EXCLUDED_PATTERNS,
      fetchTimeoutMs: env.GITHUB_FETCH_TIMEOUT_MS,
      minStars: env.CRAWLER_MIN_STARS,
      pat: env.GITHUB_PAT,
      pushedAfter: env.CRAWLER_PUSHED_AFTER,
      targetExtensions: /\.go$/,
    })
    const extractor = await createGoExtractor(env.GO_TREE_SITTER_WASM_PATH)

    // ...以降は crawler-run-typescript.ts と同一だが
    //    processRepo(..., { github }, extractor) に extractor を渡す
  },
  runType: RUN_TYPE,
  taskName: TASK_NAME,
})
```

- `createGoExtractor` は wasm ロードのため `await` する（task 冒頭で 1 回だけ生成し、ループ内で使い回す）。
- wasm の場所は `env.GO_TREE_SITTER_WASM_PATH`（dist 同梱パス）として `src/env.ts` の Zod スキーマに追加するか、`__dirname` 相対で解決する。

### `apps/cron/package.json`（スクリプト追加）

```jsonc
"crawler:run:go": "dotenvx run -f .env.local -- tsx src/task/crawler-run-go.ts"
```

### `apps/cron/CLAUDE.md`（タスク表に追記）

「含まれるタスク」表に `pnpm crawler:run:go`（週次）を追加。

## 動作確認

```bash
cd apps/api && pnpm db:migrate            # step1 の Go 行が入る
cd apps/cron && CRAWLER_REPOS_PER_RUN=1 pnpm crawler:run:go

# Go の problems が入ったことを確認
docker exec typing-royale-postgres psql -U postgres -d project-template_dev -c "
  SELECT l.slug, count(*) FROM problems p
  JOIN languages l ON l.id = p.language_id WHERE l.slug = 'go' GROUP BY l.slug;"

# crawler_runs に crawler_go が記録されたことを確認
docker exec typing-royale-postgres psql -U postgres -d project-template_dev -c "
  SELECT run_type, status, repos_processed, problems_added FROM crawler_runs
  WHERE run_type = 'crawler_go';"

# 出典が vendor/ や _test.go を含まないことを確認
docker exec typing-royale-postgres psql -U postgres -d project-template_dev -c "
  SELECT source_file_path FROM problems p JOIN languages l ON l.id = p.language_id
  WHERE l.slug = 'go' AND (source_file_path LIKE 'vendor/%' OR source_file_path LIKE '%_test.go');"
```

期待結果：Go の `problems` が増え、`crawler_go` run が `success`、vendor / `_test.go` 由来の問題が 0 件。
</content>
