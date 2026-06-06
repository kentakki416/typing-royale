# apps/cron

cron / EventBridge から定期実行されるタスク群を 1 つの Node.js ワーカーにまとめたパッケージ。本番は ECS Scheduled Task として起動される。

## 含まれるタスク

| コマンド | スケジュール | 用途 |
| --- | --- | --- |
| `pnpm crawler:run:typescript` | 週次（月曜 03:00 JST） | GitHub 上の OSS（TypeScript）から問題プールを収集（Phase 2） |
| `pnpm crawler:license-recheck` | 月初 04:00 JST | 収集済み repo のライセンス再検証（言語非依存、Phase 2） |
| `pnpm batch:ranking` | 毎時 00 分 | 言語別ランキング snapshot 更新（Phase 4） |

CLI 名はそれぞれの機能名（crawler / batch）に合わせており、ディレクトリ名（cron）は「全部 cron 駆動」という実行モデルを表す。

**crawler は言語ごとに独立した task** として実装する：AST 抽出層が言語固有（現在は TypeScript Compiler API、将来追加する JavaScript や Go は別 parser）で、1 言語の rate limit / 障害を他言語に波及させないため。新言語追加時は `task/crawler-run-<slug>.ts` を新規作成し、`LANGUAGE_SLUG` と `RUN_TYPE = "crawler_<slug>"` をハードコードする（`crawler_runs.runType` で言語識別を区別する）。Phase 2 ローンチ時点では TypeScript のみ。

## Commands

```bash
pnpm dev          # tsx watch で src/index.ts を起動（起動確認用）
pnpm build        # dist/ にコンパイル
pnpm lint         # ESLint
```

## ディレクトリ構成

ディレクトリ戦略（層の役割 / 設計ルール / 新タスク追加手順）は [`README.md#ディレクトリ戦略`](./README.md#ディレクトリ戦略) を参照。新しい task や service / client を追加するときは必ず README に従う。

要点（AI 向けサマリ）:

- **`task/<name>.ts`** は cron 1 本 = 1 ファイル。env を組み立てて Prisma / client / Repository を生成し service に DI するだけ。サブディレクトリは切らない。
- **`service/<domain>/`** に業務ロジックを置く（aggregator / verifier / orchestration など）。task 横断の再利用はここで集約する。**Repository class は service の中に書かない**。
- **`repository/prisma/`** に DB アクセスを集約する（apps/api と同じ構造）。`interface XxxRepository` + `class PrismaXxxRepository implements XxxRepository` のペアで、`index.ts` で barrel export する。
- **`client/<service>/`** に外部 API クライアント class を置く。env を直接 import しない（コンストラクタ DI）。
- **`ast/`** は TypeScript Compiler API のラッパ。
- **`lib/`** は env も DB も知らない純関数のみ。

`tasks/` （複数形）や `cli/` というディレクトリは作らない。task は単数形のディレクトリで `task/<name>.ts` のフラット配置に保つ。
service の中に Repository を置かない（DB アクセスは必ず `repository/prisma/` に分離）。

ロガーは `@repo/logger` を、それ以外の共通インフラは `@repo/db` / `@repo/redis` / `@repo/errors` を必要に応じて使う。env 検証は `src/env.ts` に Zod スキーマをインラインで定義する（`safeParse → process.exit(1)` のパターン。apps/api を参照）。

実処理は Phase 2 / Phase 4 で追加する。設計詳細は [`docs/spec/problem-pool/`](../../docs/spec/problem-pool/) と [`docs/spec/score-ranking/`](../../docs/spec/score-ranking/) を参照。

## コードスタイル

ルート `CLAUDE.md` の「Code Style and Linting」と同じ規約に従う。Function style は API と同じく `const + arrow function` を使う。
