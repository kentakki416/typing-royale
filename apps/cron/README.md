# apps/cron

cron / EventBridge から定期実行されるタスク群（GitHub クローラ・ライセンス再検証・ランキング集計）を 1 つの Node.js ワーカーにまとめたサービス。本番では ECS Scheduled Task として起動される。

詳細仕様は以下を参照:

- 問題プール（クローラ）: [`docs/spec/problem-pool/README.md`](../../docs/spec/problem-pool/README.md)
- スコア・ランキング: [`docs/spec/score-ranking/README.md`](../../docs/spec/score-ranking/README.md)

## ステータス

**Phase 0**：ディレクトリと CLI エントリポイントの雛形のみ。実処理は以下のフェーズで追加する。

| コマンド | フェーズ | 用途 |
| --- | --- | --- |
| `pnpm crawler:run` | Phase 2 | 週次クローラ（GitHub API → AST → 問題化） |
| `pnpm crawler:license-recheck` | Phase 2 | 月次ライセンス再検証 |
| `pnpm batch:ranking` | Phase 4 | 毎時ランキング集計 |

## Commands

```bash
pnpm dev        # tsx watch で src/index.ts を起動（起動確認用）
pnpm build      # dist/ にコンパイル
pnpm start      # dist/ から起動
pnpm lint       # ESLint
```
