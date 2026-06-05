# apps/cron

cron / EventBridge から定期実行されるタスク群を 1 つの Node.js ワーカーにまとめたパッケージ。本番は ECS Scheduled Task として起動される。

## 含まれるタスク

| コマンド | スケジュール | 用途 |
| --- | --- | --- |
| `pnpm crawler:run` | 週次（月曜 03:00 JST） | GitHub 上の OSS から問題プールを収集（Phase 2） |
| `pnpm crawler:license-recheck` | 月初 04:00 JST | 収集済み repo のライセンス再検証（Phase 2） |
| `pnpm batch:ranking` | 毎時 00 分 | 言語別ランキング snapshot 更新（Phase 4） |

CLI 名はそれぞれの機能名（crawler / batch）に合わせており、ディレクトリ名（cron）は「全部 cron 駆動」という実行モデルを表す。

## Commands

```bash
pnpm dev          # tsx watch で src/index.ts を起動（起動確認用）
pnpm build        # dist/ にコンパイル
pnpm lint         # ESLint
```

## ディレクトリ構成

```
apps/cron/
├── src/
│   ├── cli/                  # CLI エントリポイント（package.json の bin と 1:1）
│   │   ├── run.ts            # crawler:run          - 週次クローラ
│   │   ├── license-recheck.ts# crawler:license-recheck - 月次ライセンス再検証
│   │   └── ranking-batch.ts  # batch:ranking        - 毎時ランキング集計
│   ├── tasks/                # タスク固有ロジック（cli から呼ぶ）
│   │   ├── crawler/          # 問題プール収集（Phase 2）
│   │   ├── license-recheck/  # ライセンス再検証（Phase 2）
│   │   └── ranking/          # ランキング集計（Phase 4）
│   ├── client/               # 外部 API クライアント（タスク横断で再利用）
│   │   └── github/           # GitHub REST + raw content（GithubClient class）
│   ├── ast/                  # TypeScript Compiler API ラッパ（crawler が使用）
│   ├── lib/                  # 汎用ユーティリティ（タスク・クライアント横断）
│   │   ├── retry.ts          # 指数バックオフ + jitter
│   │   └── source-url.ts     # GitHub permalink 組み立て
│   ├── env.ts                # Zod による env 検証（safeParse → process.exit(1)）
│   └── index.ts              # pnpm dev のエントリ（起動確認用）
├── test/                     # src と同じツリー構造で配置
│   ├── client/github/
│   ├── ast/
│   ├── tasks/...
│   ├── lib/
│   └── fixtures/             # 実 API レスポンスの JSON 等
├── Dockerfile                # 本番用 (turbo prune + installer-builder + runner)
├── package.json
└── tsconfig.json
```

### 層の役割

| 層 | 何を置くか | 何を置かないか |
| --- | --- | --- |
| `cli/` | CLI 引数のパース、env の組み立て、`tasks/*` の `run()` を呼ぶ薄いエントリ | ビジネスロジック・I/O |
| `tasks/<name>/` | そのタスク固有の手順（DB / 外部 API / ドメインロジックの組み立て） | 他タスクから再利用される汎用処理 |
| `client/<service>/` | 外部 API クライアント class（GithubClient のような）。env 依存はコンストラクタ DI | タスク固有の業務ルール |
| `ast/` | TypeScript Compiler API のラッパ（crawler 専用だが横断的に使う想定がある層） | — |
| `lib/` | retry / URL 組み立て・GitHub 以外でも使うユーティリティ | 特定タスク・特定サービスの知識 |

### 新タスク追加時の手順（例：通知バッチを追加するケース）

1. `src/cli/notify-batch.ts` を作って `package.json` の `scripts` に追加
2. `src/tasks/notify/` にタスクの本体（`run.ts` + 必要なら repository / domain）を実装
3. 新しい外部サービス（例：Slack）を叩くなら `src/client/slack/` に `SlackClient` を作る
4. PAT / token 等は `src/env.ts` に追加し、cli から `new SlackClient({ token: env.SLACK_TOKEN })` で DI
5. テストは `test/tasks/notify/` と `test/client/slack/` に src と対応する形で置く

### 設計のルール

- **client は env を直接 import しない**。`new GithubClient({ pat, ... })` のように cli 側で組み立てて DI する。同じクライアントを CLI が切り替わっても再利用できるようにするため。
- **tasks は他 tasks に依存しない**。横断したくなったら `lib/` に汎用ヘルパとして切り出すか、`client/` を作るか検討する。
- **lib は env も DB も知らない**。引数だけで完結する純関数を置く。

ロガーは `@repo/logger` を、それ以外の共通インフラは `@repo/db` / `@repo/redis` / `@repo/errors` を必要に応じて使う。env 検証は `src/env.ts` に Zod スキーマをインラインで定義する（`safeParse → process.exit(1)` のパターン。apps/api を参照）。

実処理は Phase 2 / Phase 4 で追加する。設計詳細は [`docs/spec/problem-pool/`](../../docs/spec/problem-pool/) と [`docs/spec/score-ranking/`](../../docs/spec/score-ranking/) を参照。

## コードスタイル

ルート `CLAUDE.md` の「Code Style and Linting」と同じ規約に従う。Function style は API と同じく `const + arrow function` を使う。
