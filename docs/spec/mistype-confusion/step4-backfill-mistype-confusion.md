# step4: 過去データのバックフィル（誤入力内訳の復元）

保存済み keystroke_logs を新ロジックで再集計し、過去の `play_sessions.mistype_stats` と `user_lifetime_stats.lifetimeMistypeStats` に誤入力内訳を復元する一度きりのスクリプト。先の空行バックフィル（`apps/cron`）と同じ運用。

## 対応内容

### スクリプト（`apps/cron/src/script/backfill-mistype-confusion.ts` 新規・使い捨て）

処理の流れ：

1. `play_sessions` を id カーソルで分割取得（keystroke_logs を join）。
2. keystroke_logs があるセッションは、対応する problems の codeBlock を引き、`aggregateMistypeStats`（nested 版）で再集計 → `mistype_stats` を nested で上書き。
   - codeBlock は `play_session_problems` 経由で `problems.code_block` を `orderIndex → code` の Map に組む（finish 時と同じ引き方）。
   - keystroke_logs が無いセッションはスキップ（読み出し時に `normalizeMistypeStats` が `"?"` 内訳へ正規化するため flat のまま放置でよい）。
3. 各ユーザーの `lifetimeMistypeStats` を、そのユーザーの全セッションの nested `mistype_stats` を `mergeMistypeStats` で畳み込んで再構築 → 上書き。
   - 「生涯統計は再集計で“作り直す”」方針（個別加算ではなくフル再計算）にすると冪等で安全。
4. `--dry-run` で「更新予定セッション数 / ユーザー数」を出力（書き込みなし）。

集計・正規化・マージは **API と同じ純関数を再利用する**（`@repo/*` 経由か、ロジックを `apps/api` から共有可能な場所に置く）。重複実装しない。

```ts
/** 概略（詳細は実装時に既存 backfill-strip-blank-lines.ts の骨格を踏襲） */
const stripped = aggregateMistypeStats(decode(keystrokeLog), codeByOrder)  // nested
if (!dryRun) await prisma.playSession.update({ where: { id }, data: { mistypeStats: stripped } })
```

### 実行（prd は ECS run-task の command override）

```bash
# ローカル
pnpm --filter cron backfill:mistype-confusion -- --dry-run
pnpm --filter cron backfill:mistype-confusion

# prd（cron イメージを最新にデプロイ後）
node dist/script/backfill-mistype-confusion.js --dry-run
node dist/script/backfill-mistype-confusion.js
```

`package.json` に `backfill:mistype-confusion` を追加し、実行・検証後に **スクリプトと script エントリを別 PR で削除**する。

## 動作確認

- `--dry-run` で更新予定件数がログに出る（書き込み 0）。
- 本実行後、サンプルセッションの `mistype_stats` が nested（`{ "l": { "k": 2 } }` 形）になっていることを SQL で確認。
- 冪等性：本実行 → 再 `--dry-run` で更新 0 件（先の空行バックフィルと同じ検証）。
- ログ欠損セッション：keystroke_logs が無い行は flat のまま残り、`/api/user` 経由で `mistyped: [{ char: "?", count: N }]` として返ることを確認。

> 注意：このバックフィルは step1〜step3 が prd にデプロイされた後（読み出し側が nested + 正規化に対応した後）に実行する。順序を誤ると古い読み出しコードが nested を flat として誤解釈する恐れがあるため、**デプロイ → バックフィルの順** を厳守する。
