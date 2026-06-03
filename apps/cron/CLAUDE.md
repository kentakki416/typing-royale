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

## ディレクトリ構成（Phase 0 時点）

```
apps/cron/
├── src/
│   ├── cli/                  # CLI エントリポイント
│   │   ├── run.ts            # 週次クローラ
│   │   ├── license-recheck.ts
│   │   └── ranking-batch.ts
│   ├── log/                  # 共通ロガー (pino)
│   └── index.ts              # pnpm dev のエントリ（起動確認用）
├── Dockerfile                # 本番用 (builder / runner)
├── package.json
└── tsconfig.json
```

実処理は Phase 2 / Phase 4 で追加する。設計詳細は [`docs/spec/problem-pool/`](../../docs/spec/problem-pool/) と [`docs/spec/score-ranking/`](../../docs/spec/score-ranking/) を参照。

## コードスタイル

ルート `CLAUDE.md` の「Code Style and Linting」と同じ規約に従う。Function style は API と同じく `const + arrow function` を使う。
