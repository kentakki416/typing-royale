# 実装 TODO

MVP リリースまでのタスクをフェーズ別・機能単位で整理。`design-feature` skill による設計は完了済み、ここからは実装フェーズ。

**進め方の原則**：

1. **まずローカルで動くものを作る**（Docker Compose で完結）
2. 各機能を順に実装、コミット、動作確認
3. すべての機能がローカルで動いたら、**インフラ構築 → デプロイ → 本番ローンチ** の順に進める
4. インフラを先に作ると、空のサービスが課金され続ける + 完成までモチベーションが下がる

各タスクは `[ ]` 未着手 / `[~]` 進行中 / `[x]` 完了 で進捗管理。

参照ドキュメント：

- [`docs/README.md`](docs/README.md) — プロダクト全体像
- [`docs/spec/README.md`](docs/spec/README.md) — 機能一覧と各 spec へのリンク
- [`docs/infra.md`](docs/infra.md) — インフラ全体設計
- [`docs/mocks/`](docs/mocks/) — **UI デザインのモック（HTML/CSS）。web の画面実装時は必ず該当モックを参照してマークアップ・配色・レイアウトを揃える**

---

## 目次

- [Phase 0: ローカル開発環境セットアップ](#phase-0-ローカル開発環境セットアップ)
- [Phase 1: GitHub OAuth 認証](#phase-1-github-oauth-認証)
- [Phase 2: 問題プール（クローラ）](#phase-2-問題プールクローラ)
- [Phase 3: タイピングコアエンジン（通常モード）](#phase-3-タイピングコアエンジン通常モード)
- [Phase 4: スコア・ランキング + エンジニアグレード](#phase-4-スコアランキング--エンジニアグレード)
- [Phase 5: 神々モード・キーストロークログ](#phase-5-神々モードキーストロークログ)
- [Phase 6: リプレイ閲覧](#phase-6-リプレイ閲覧)
- [Phase 7: 特典（MVP 3 種）](#phase-7-特典mvp-3-種)
- [Phase 8: 広告配信](#phase-8-広告配信)
- [Phase 9: インフラ構築・デプロイ](#phase-9-インフラ構築デプロイ)
- [Phase 10: リリース準備・ローンチ](#phase-10-リリース準備ローンチ)

---

## Phase 0: ローカル開発環境セットアップ

ローカルで全機能を動かすための土台を作る。AWS / Vercel への接続は Phase 9 で行う。

### ローカル環境

- [x] `docker-compose.yaml` を確認・更新（PostgreSQL + Redis のローカル起動）
- [x] `.env.example` 作成（必須環境変数の一覧、ローカル用デフォルト値）
- [x] `apps/api` の Dockerfile 作成（本番用 builder / runner マルチステージ。ローカル開発は `pnpm dev` で起動するため dev ステージは不要）
- [x] `apps/cron/` ディレクトリ作成・`package.json`・Dockerfile（クローラ + ライセンス再検証 + ランキングバッチを兼ねる）
- [ ] `pnpm dev` で web / api / Postgres / Redis が同時起動できることを確認
- [x] Sentry のローカルダミー DSN 設定（本番接続は Phase 9）
- [x] `apps/api` に `/healthz` エンドポイント追加 ← 既存の `GET /api/health` (liveness) と `GET /api/health/ready` (readiness) で要件充足。ALB / ECS のヘルスチェックパスは Phase 9 でターゲットグループ設定時にこちらを指定する

### GitHub 連携の最小準備（ローカルテスト用）

- [x] **GitHub OAuth App（dev 用）**を作成（`http://localhost:3000/api/auth/callback/github` を callback に登録）
- [ ] GitHub PAT 発行（クローラ用、運営アカウント。**`public_repo` スコープのみ**）
- [x] `.env.local` に `GITHUB_CLIENT_ID/SECRET` を記載（dotenvx 暗号化）/ `GITHUB_PAT` は Phase 2 で追加

> AWS / Vercel / Sentry 本番 / Google AdSense 等のアカウント設定は **Phase 9 で実施**。Phase 0〜8 はすべてローカルで完結。

---

## Phase 1: GitHub OAuth 認証

参照：[`docs/spec/github-auth/`](docs/spec/github-auth/README.md)

### DB スキーマ・Prisma

- [x] `User` テーブル定義（`id`, `displayName`, `avatarUrl`, `canPublicRanking`, `createdAt`, `updatedAt`）
- [x] `AuthAccount` テーブル定義（`id`, `userId`, `provider`, `providerUserId`, `createdAt`、複合一意制約）
- [x] Prisma スキーマ作成・初回マイグレーション
- [x] Seed データ作成（dev 用テストユーザー Alice / Bob）

### apps/api（Express）

- [x] `apps/api/src/client/github-oauth.ts` 新規（code → access_token → user info の薄いラッパー）
- [x] `apps/api/src/controller/auth/github.ts` 新規（`POST /api/auth/github` Controller）
- [x] `apps/api/src/service/auth-service.ts` に `authenticateWithGithub` 追加
- [x] `apps/api/src/repository/prisma/auth-account-repository.ts` 拡張（provider 汎用化）
- [x] `apps/api/src/lib/jwt.ts` 既存利用（access 15分 / refresh 7日）
- [x] `apps/api/src/repository/redis/refresh-token-repository.ts` 既存利用
- [ ] `POST /api/auth/refresh`、`POST /api/auth/logout`、`GET/PATCH/DELETE /api/me` の動作確認（既存共用）
- [ ] `POST /api/play-sessions/claim` 新規（ゲストプレイのバッファをアカウント紐付け、Phase 3 と並行可）
- [ ] 単体テスト（auth-service / github-oauth）

### apps/web（Next.js）

> **UI は [`docs/mocks/`](docs/mocks/) のモックを参照して実装する**（特に `modal-login.html` / `onboarding.html` / `mypage.html` / `mypage-settings.html`）。

- [x] `apps/web/src/app/sign-in/page.tsx` 拡張（GitHub ボタン追加）← デザインは `docs/mocks/modal-login.html` 参照
- [x] `apps/web/src/app/sign-in/actions.ts` に `startGithubOAuth` Server Action 追加
- [x] `apps/web/src/app/api/auth/callback/github/route.ts` 新規（callback Route Handler）
- [x] `apps/web/src/libs/auth.ts` 既存利用（cookie 操作）
- [x] `apps/web/src/middleware.ts` 既存利用（認証ガード）
- [x] マイページ > ホーム画面の枠だけ実装（中身は Phase 4 でグレード表示）← デザインは `docs/mocks/mypage.html` 参照
- [x] マイページ > アカウント設定画面（表示名 / canPublicRanking / アカウント削除）← デザインは `docs/mocks/mypage-settings.html` 参照
- [x] 初回ログイン後のオンボーディング画面 ← デザインは `docs/mocks/onboarding.html` 参照

### 動作確認（ローカル）

- [x] dev 環境で GitHub ログイン成功確認（2026-06-04 認証フロー完走 / migration 適用後）
- [ ] httpOnly cookie に JWT が保存されることを確認
- [ ] refresh token が Redis に保存されることを確認
- [ ] アカウント削除で User / AuthAccount / refresh token が全削除されることを確認

---

## Phase 2: 問題プール（クローラ）

参照：[`docs/spec/problem-pool/`](docs/spec/problem-pool/README.md)

### DB スキーマ

- [x] `languages` テーブル定義（`id`, `name`, `slug`）+ Seed（TS / JS）
- [x] `crawled_repos` テーブル定義（`description`, `homepage`, `topics`, `candidatesCount`, `storedCount`, `crawledAt`, `disabled` 含む。`eligible` フラグは持たず `disabled` 単独）
- [x] `problems` テーブル定義（`languageId`, `sourceFilePath`, `sourceLineStart`, `sourceLineEnd`, `sourceUrl`, `astHash`, `disabled` 含む。`@@unique([languageId, astHash])`）
- [x] `crawler_runs` テーブル定義（+ 子テーブル `crawler_run_items` で repo 単位の履歴を分離）
- [x] Prisma マイグレーション（`20260605011501_problem_pool_initial`）

### apps/cron 実装

- [x] `apps/cron/` 初期構成（`package.json` / TypeScript / 共通ロガー）
- [ ] GitHub Search API クライアント実装（言語 / ライセンス / stars / pushed フィルタ）
- [ ] GitHub Repos API クライアント実装（description / homepage / topics 取得）
- [ ] GitHub Tree / Raw API クライアント実装（ファイル取得）
- [ ] `processRepo(target)` メイン関数：メタ取得 → ファイル取得 → AST → 関数抽出
- [ ] **TypeScript Compiler API による AST 解析**
  - [ ] `ts.createSourceFile` でファイル解析
  - [ ] FunctionDeclaration / ArrowFunctionExpression / FunctionExpression / MethodDeclaration を抽出
  - [ ] 行範囲取得（`sourceFile.getLineAndCharacterOfPosition`）
- [ ] **コメント除去ロジック**（`forEachLeadingCommentRange` / `forEachTrailingCommentRange`）
- [ ] 採用条件チェック（文字数 / 非 ASCII / 行長 / 関数名）
- [ ] AST 正規化ハッシュで重複排除
- [ ] repo 単位の足切り（採用候補 30 個以上で disabled=false / storedCount=保存件数、ランダムサンプリング最大 100 個）
- [ ] `crawler_runs` への結果記録（同日 running の二重起動防止）
- [ ] 失敗時のハンドリング（HTTP 5xx / 404 / レート制限）
- [ ] `pickNextRepo()` 実装（Search 結果から未登録の最上位 repo を選定）
- [ ] CLI エントリポイント `pnpm crawler:run`
- [ ] 月次ライセンス再検証 CLI `pnpm crawler:license-recheck`
- [ ] Sentry 連携（dev はオフ）

### 動作確認（ローカル）

- [ ] ローカル環境で `pnpm crawler:run` を 1 repo 処理してみる（例：`colinhacks/zod`）
- [ ] `crawled_repos` / `problems` テーブルに正しくデータが入ることを確認
- [ ] `sourceUrl` が GitHub の行範囲ハイライト付き URL になっていることを確認
- [ ] コメント除去後のコードを目視確認
- [ ] **ローカルでブートストラップ実行**：`CRAWLER_REPOS_PER_RUN=5` で 5〜10 repo 一気に積み上げる動作確認
- [ ] 失敗時のリトライ・disabled 化の挙動確認

---

## Phase 3: タイピングコアエンジン（通常モード）

参照：[`docs/spec/typing-engine/`](docs/spec/typing-engine/README.md)

### DB スキーマ追加

- [ ] `play_sessions` テーブル定義（`crawledRepoId`, `repoFallback`, `mistypeStats`, `flagged` 等含む）
- [ ] `play_session_problems` テーブル定義
- [ ] `keystroke_logs` テーブル定義（gzip bytea）
- [ ] Prisma マイグレーション

### apps/api 実装（ソロモード）

- [ ] `POST /api/play-sessions/solo` Controller
  - [ ] `disabled=false AND storedCount > 0` の repo からランダム 1 選定
  - [ ] 20 問抽出（fallback ロジック含む）
  - [ ] `repoInfo` 構築
  - [ ] Redis にステート保存（TTL 5 分）
- [ ] `POST /api/play-sessions/:id/finish` Controller
  - [ ] Redis ステート取得
  - [ ] `score = typedChars × accuracy` 計算
  - [ ] スコア上限チェック（120 秒で 1500 文字超 → HTTP 400）
  - [ ] 認証済みなら DB 保存、ゲストならスキップ
  - [ ] サーバー側で `mistypeStats` 集計（keystroke log から）
  - [ ] `user_lifetime_stats` 更新（`totalTypedChars`、`bestScore` 等）
  - [ ] Redis ステート削除
- [ ] keystroke log を gzip 圧縮して保存
- [ ] paste イベント検知（クライアント側、サーバーで二重チェック不要）

### apps/web 実装（通常モード UI）

> **UI は [`docs/mocks/`](docs/mocks/) のモックを参照**：`top.html` / `language-select.html` / `play.html` / `result.html`。

- [ ] トップ画面（言語選択への導線）← `docs/mocks/top.html`
- [ ] 言語選択画面（TypeScript / JavaScript の 2 ボタン）← `docs/mocks/language-select.html`
  - [ ] **「神々に挑戦」ボタン**も配置（Phase 5 で有効化）
- [ ] 「今日の挑戦」スプラッシュ画面（repo 名 + Star 数 + description、2 秒表示）
- [ ] **プレイ画面**（コアコンポーネント）← `docs/mocks/play.html`
  - [ ] コード表示（打鍵済み / 現在位置 / 未打鍵で色分け）
  - [ ] キー入力ハンドリング（1 文字判定、誤入力時の進行ロック）
  - [ ] paste イベント無効化
  - [ ] 120 秒カウントダウン（`requestAnimationFrame` + `performance.now()`）
  - [ ] 累計文字数・正確率の表示
  - [ ] 関数完走時の自動次問題遷移
  - [ ] **20 問完走時の「お見事！」表示**（タイマー継続）
  - [ ] サイドに repo 名・関数名を控えめ表示
  - [ ] IME ON 検知 → 警告表示
- [ ] **キーストロークログ記録**（`{ t, p, ch, ok }` の配列）
- [ ] **リザルト画面**（基本版、順位は Phase 4 で）← `docs/mocks/result.html`
  - [ ] スコア・累計文字数・正確率・出題数 / 完走数
  - [ ] 「ちなみに今回のリポジトリは XXX… コメント」（`repoInfo` から）
  - [ ] ニガテ文字（`mistypeStats` 上位 5〜10）
  - [ ] シェアボタン

### ゲストプレイ対応

- [ ] IndexedDB に一時バッファ保存（リザルト画面表示中のみ）
- [ ] 「ログインして記録を残す」ボタン → OAuth → `/api/play-sessions/claim`
- [ ] ログイン拒否 / 画面離脱時の IndexedDB 即時削除

### 動作確認（ローカル）

- [ ] ローカルで言語選択 → スプラッシュ → 120 秒プレイ → リザルトの一連の流れ
- [ ] サーバー側で `play_sessions` / `keystroke_logs` / `mistypeStats` が正しく保存される
- [ ] ゲストでプレイ → ログイン → アカウントに紐付くフローの確認
- [ ] 寿司打と並走テストでタイピング体感を比較

---

## Phase 4: スコア・ランキング + エンジニアグレード

参照：[`docs/spec/score-ranking/`](docs/spec/score-ranking/README.md)

### DB スキーマ追加

- [ ] `ranking_snapshots` テーブル定義（言語別 × トップ 1000、`snapshotUpdatedAt` 含む）
- [ ] `user_lifetime_stats` テーブル定義（`bestScore`, `currentGrade`, `currentGradeReachedAt`, `lifetimeMistypeStats` 等含む）
- [ ] Prisma マイグレーション

### apps/api 実装（ランキング）

- [ ] **毎時バッチスクリプト** 実装（CLI コマンド `pnpm batch:ranking`、top-1000 ヒープ抽出、`WHERE publicRanking=true AND NOT flagged`）
- [ ] `ranking_snapshots` 更新ロジック
- [ ] Redis キャッシュ更新（バッチ完了時に該当キー失効）
- [ ] `GET /api/rankings` Controller（言語別トップ 10 + `snapshotUpdatedAt`）
- [ ] `GET /api/rankings/me` Controller（1000 位以内 or 圏外を判定して返す）

### グレード判定ロジック

- [ ] `GRADES` 定数定義（Intern → Fellow の 8 段階）
- [ ] `calcGrade(bestScore)` 関数実装
- [ ] `/finish` 時の `bestScore` 更新時にグレード再判定
- [ ] `currentGrade` / `currentGradeReachedAt` 更新
- [ ] グレードアップ時はレスポンスに `gradeUp: { from, to }` を含める

### apps/web 実装

> **UI は [`docs/mocks/`](docs/mocks/) のモックを参照**：`ranking.html` / `player-detail.html` / `mypage.html`。

- [ ] ランキング画面（言語タブ切替、トップ 10 表示、自分の順位 or 「圏外」表示）← `docs/mocks/ranking.html`
- [ ] プレイヤー詳細ページ ← `docs/mocks/player-detail.html`
- [ ] **リザルト画面拡張**：
  - [ ] 「現在のエンジニアグレード」表示（即時）
  - [ ] 次グレードまでの進捗バー
  - [ ] 「集計時刻 XX:XX 時点」の順位表示（圏外なら別表示）
  - [ ] グレードアップ時の祝賀演出
- [ ] **マイページ > ホーム画面**：
  - [ ] グレード大表示 + 進捗バー
  - [ ] ベストスコア / 全期間順位（or 圏外）/ 累計打鍵数 / 連続日数
  - [ ] グレード昇格履歴

### 動作確認（ローカル）

- [ ] プレイ → DB 保存 → 手動バッチ実行 → ランキング画面に反映
- [ ] グレードアップ時の挙動確認（リザルト演出 + マイページ反映）
- [ ] 圏外ユーザーの UX 確認（順位の代わりにグレード進捗）
- [ ] `publicRanking=false` 切り替えでランキングから除外されることを確認

---

## Phase 5: 神々モード・キーストロークログ

参照：[`docs/spec/ghost-battle/`](docs/spec/ghost-battle/README.md)

### apps/api 実装

- [ ] `POST /api/play-sessions/challenge-gods` Controller
  - [ ] オールタイムトップ 10 から `publicRanking=true` のユーザーをランダム抽選
  - [ ] 抽選した神の `play_session_problems` 先頭 20 問取得
  - [ ] その神のセッションの `crawled_repos` から `repoInfo` を構築
  - [ ] Redis に `mode=challenge_gods` で保存
  - [ ] トップ 10 不在時は HTTP 409
- [ ] `GET /api/ghosts/:playSessionId` Controller
  - [ ] `keystroke_logs.compressedLog` を gzip のまま返却
  - [ ] HTTP `Cache-Control: public, max-age=86400`

### apps/web 実装

> **UI は [`docs/mocks/`](docs/mocks/) のモックを参照**：`play-ghost.html` / `modal-ghost-result.html`。

- [ ] 言語選択画面の「神々に挑戦」ボタン有効化
  - [ ] トップ 10 不在時（HTTP 409）はボタンを disabled + 通常モード誘導
- [ ] **神々モードプレイ画面**：← `docs/mocks/play-ghost.html`
  - [ ] ヘッダーに「あなた：XXX 文字 / 神：YYY 文字」とリアルタイム差分バー
  - [ ] サイドエリアに神の現在状態（「問題 3 / 12 行目」）
  - [ ] 神の表示名にグレード名併記（例：「Principal Engineer kenta」）
- [ ] **ゴースト再生エンジン**：
  - [ ] gzip 解凍
  - [ ] `requestAnimationFrame` で `t` の経過時刻に合わせて進行
  - [ ] 神の累計文字数を秒単位で算出
- [ ] **神々戦リザルト画面**：← `docs/mocks/modal-ghost-result.html`
  - [ ] 勝敗・累計文字数差・正確率差・出題進捗の比較
  - [ ] 「もう一度」「別の神」ボタン
- [ ] **ゴーストデータ取得失敗時の再抽選**（最大 3 回、失敗で通常モードへ）

### 動作確認（ローカル）

- [ ] テストユーザー数名でプレイし、トップ 10 のデータを作る
- [ ] 神々モード起動 → ゴーストと併走 → リザルト
- [ ] トップ 10 不在時のフォールバック（DB をクリアして検証）
- [ ] ゴーストデータ欠落時の再抽選

---

## Phase 6: リプレイ閲覧

参照：[`docs/spec/replay-viewer/`](docs/spec/replay-viewer/README.md)

### DB スキーマ追加

- [ ] `play_sessions.persistReplay (bool)` カラム追加（トップ 10 入賞時に true）
- [ ] Prisma マイグレーション

### apps/api 実装

- [ ] `GET /api/replays/:playSessionId` Controller
  - [ ] `play_sessions` + `play_session_problems` + `keystroke_logs` + `problems` を組み合わせて返却
  - [ ] HTTP `Cache-Control: public, max-age=604800`（7 日）
- [ ] `GET /api/replays/featured` Controller（Hall of Fame 連携）
- [ ] 毎時バッチでトップ 10 入賞プレイの `persistReplay=true` に更新

### apps/web 実装

> **UI は [`docs/mocks/replay.html`](docs/mocks/replay.html) を参照**。

- [ ] **リプレイ画面**：← `docs/mocks/replay.html`
  - [ ] コード表示エリア（コメント除去後の codeBlock）
  - [ ] キーストローク再描画エンジン（再生・一時停止・1.5x / 2x 倍速・シーク）
  - [ ] プログレスバーは 120 秒全体、問題遷移マーカー表示
  - [ ] 累計文字数 / 正確率 / 経過時間 / 「問題 3 / 8」表示
  - [ ] 出典表示（repo / file / 行範囲 / ライセンス / コミット SHA / 関数名）
  - [ ] 「GitHub で原文を見る（コメント付き）」リンク
- [ ] ランキング画面に「リプレイを見る」ボタン
- [ ] プレイヤー詳細ページにそのプレイヤーの代表リプレイ一覧
- [ ] SNS シェアボタン（X / Reddit / Zenn）と OG カード

### 動作確認（ローカル）

- [ ] トップ 10 のリプレイを実際に閲覧
- [ ] シーク・倍速の動作確認
- [ ] モバイル閲覧の動作確認（プレイは PC のみ）

---

## Phase 7: 特典（MVP 3 種）

参照：[`docs/spec/rewards/`](docs/spec/rewards/README.md)

### DB スキーマ追加

- [ ] `rewards` テーブル定義（`type` enum: badge / card / hall_of_fame）
- [ ] `hall_of_fame_entries` テーブル定義（`comment` + `commentDraft` カラム含む）
- [ ] `badge_configs` テーブル定義（`displayItems` jsonb）
- [ ] Prisma マイグレーション

> **UI は [`docs/mocks/`](docs/mocks/) のモックを参照**：`badge-customize.html` / `hall-of-fame.html` / `mypage-rewards.html` / `modal-achievement.html` / `modal-top10-comment.html`。

### 動的 SVG バッジ

- [ ] `GET /badge/:username.svg` Controller
- [ ] SVG テンプレート作成（グレード名 / スコア / ランク / 連続日数 / 累計の組み合わせ）
- [ ] バッジカスタマイズ画面（マイページ）← `docs/mocks/badge-customize.html`
- [ ] HTTP `Cache-Control: public, max-age=300, stale-while-revalidate=600`
- [ ] `badge_configs` 更新時に CDN キャッシュ無効化（ローカルでは確認のみ、本番設定は Phase 9）

### 達成カード PNG

- [ ] `satori` + `resvg-js` セットアップ
- [ ] カードテンプレート JSX 作成（グレード別の色・装飾分岐）
- [ ] `POST /api/rewards/cards` Controller
  - [ ] 生成 → ローカルファイル保存（dev）/ S3 保存（Phase 9 で接続）
  - [ ] URL 返却
- [ ] 達成条件チェック実装：
  - [ ] グレードアップ時
  - [ ] 累計 10,000 文字 / 100,000 文字 達成時
  - [ ] 初トップ 10 入り時
  - [ ] 7 日連続プレイ達成時
- [ ] 達成通知モーダル（プレイ完了直後）← `docs/mocks/modal-achievement.html`

### Hall of Fame

- [ ] `GET /api/hall-of-fame` Controller（言語別トップ 10 + 公開コメント）
- [ ] `POST /api/hall-of-fame/comments` Controller（本人コメント登録、NG ワードフィルタ）
- [ ] `/finish` レスポンスに **`topTenBoundaryScore`**（直近 snapshot の言語別 10 位スコア）を含める
- [ ] **リザルト画面のコメント入力モーダル**：← `docs/mocks/modal-top10-comment.html`
  - [ ] `myScore > topTenBoundaryScore` でモーダル表示
  - [ ] 「🎉 トップ 10 入り見込み！」と暫定 UI 明示
  - [ ] 入力内容を `commentDraft` に下書き保存
  - [ ] 「あとで書く」スキップ動線
- [ ] **draft → 公開昇格バッチ**：
  - [ ] 毎時ランキングバッチ後、入賞確定者の `commentDraft` を `comment` に昇格・公開
  - [ ] 圏外押し出し時は `commentDraft` を保持（次回入賞で再昇格 or マイページ再編集を促す）
  - [ ] NG ワードフィルタを `commentDraft` 保存時（一次）と `comment` 昇格時（二次）の二段で実施
- [ ] **マイページ > Hall of Fame コメント編集**：
  - [ ] 入賞中の編集は即座に `comment` 反映（次バッチ待たない）
  - [ ] 編集履歴の保持
- [ ] Hall of Fame 画面実装 ← `docs/mocks/hall-of-fame.html`
- [ ] リプレイへの導線

### マイページ > 特典タブ

- [ ] 獲得済み特典の一覧 ← `docs/mocks/mypage-rewards.html`
- [ ] バッジ URL のコピー機能
- [ ] 達成カード PNG のダウンロード機能
- [ ] **Coming Soon プレースホルダ枠**（3D / Lottie / カード / アート / 公式 X 紹介投稿）

### 動作確認（ローカル）

- [ ] SVG バッジをローカルでブラウザ表示確認
- [ ] グレードアップで達成カードが自動生成されローカル保存されることを確認
- [ ] Hall of Fame のコメント入力 → draft → 公開昇格フロー確認

---

## Phase 8: 広告配信

参照：[`docs/spec/adsense/`](docs/spec/adsense/README.md)

> AdSense のアカウント取得・審査は本番デプロイ後に行う（Phase 9〜10）。Phase 8 ではプレースホルダ実装と CLS 抑制のレイアウトだけ作る。

### apps/web 実装

- [ ] レイアウトコンポーネントに「広告スロット」プレースホルダ配置
  - [ ] 固定サイズ予約（CLS 抑制）
  - [ ] ローカルではダミーのカラーボックス表示
- [ ] **プレイ画面・神々モード中は広告スロット自体を描画しない**ガード
- [ ] 各画面に広告スロットを配置：
  - [ ] トップ（ヘッダー下 / フッター上）
  - [ ] 言語選択（サイドバー）
  - [ ] リザルト（スコア下部）
  - [ ] ランキング（サイドバー）
  - [ ] マイページ（サイドバー）
  - [ ] リプレイ（再生終了後のみ）
  - [ ] Hall of Fame（サイドバー）
- [ ] AdSense スクリプト読み込みコンポーネント（環境変数 `ADSENSE_PUB_ID` が set されていればロード、ローカルでは無効）

### GDPR 対応

- [ ] Google Consent Mode v2 導入
- [ ] EU からのアクセス検知 → 同意モーダル表示
- [ ] 同意状態に応じてパーソナライズ広告 ON/OFF 切替

### 動作確認（ローカル）

- [ ] プレイ画面で広告スロットが描画されないことを確認
- [ ] 広告スロットの固定サイズで Lighthouse の CLS が良好なことを確認

---

## Phase 9: インフラ構築・デプロイ

参照：[`docs/infra.md`](docs/infra.md)

Phase 1〜8 がローカルですべて動くようになったら、本番環境を構築する。

### Vercel セットアップ

- [ ] Vercel プロジェクト作成（`apps/web` を root に指定）
- [ ] カスタムドメイン設定（`app.example.com`）
- [ ] Vercel Env Vars 登録（`NEXT_PUBLIC_API_URL`、`GITHUB_CLIENT_ID/SECRET`、`ADSENSE_PUB_ID`）
- [ ] Vercel Analytics 有効化
- [ ] PR プレビュー自動デプロイ確認

### Terraform 構築（`infra/terraform/`）

- [ ] Terraform backend（S3 + DynamoDB lock）の bootstrap（既存環境を確認）
- [ ] **VPC / Subnet / Security Group モジュール**（public / private subnet を AZ 2 つに配置）
- [ ] Route 53 ホストゾーン作成
- [ ] ACM 証明書発行（ALB / CloudFront 用）
- [ ] S3 バケット作成（`typing-royale-assets-{env}`、暗号化・バージョニング有効）
- [ ] CloudFront ディストリビューション作成（S3 origin + ALB origin for SVG バッジ）
- [ ] **RDS PostgreSQL（db.t4g.micro）作成**（private subnet、20GB gp3、自動バックアップ 7 日）
- [ ] **ElastiCache Redis（cache.t4g.micro）作成**（private subnet）
- [ ] **ALB 作成**（HTTPS リスナー + ACM 証明書 + ターゲットグループ）
- [ ] **ECS Cluster 作成**
- [ ] **ECS Task Definition 作成**（api / cron の 2 種。cron は `command` で 3 つの CLI を切替）
- [ ] **ECS Service 作成**（api、Fargate Spot 50% + On-Demand 50% 混成、min 1 / max 10）
- [ ] **ECR リポジトリ作成**（api / cron 共通）
- [ ] **EventBridge ルール作成**（いずれも cron Task Definition を起動、`command` で切替）：
  - [ ] 週次月曜 03:00 JST → `crawler:run`
  - [ ] 毎時 00 分 → `batch:ranking`
  - [ ] 月初 04:00 JST → `crawler:license-recheck`
- [ ] AWS Secrets Manager に環境変数登録（DATABASE_URL / REDIS_URL / JWT_SECRET / GITHUB_PAT 等）
- [ ] **IAM ロール作成**：ECS タスクロール / タスク実行ロール / GitHub OIDC ロール
- [ ] CloudWatch ロググループ作成（api / cron）
- [ ] CloudWatch アラーム設定（ECS CPU/Memory、ALB 5xx、RDS connections）

### GitHub Actions（CI/CD）

- [ ] GitHub OIDC ロール作成（AWS 側）→ GitHub Repo 設定でひも付け
- [ ] `pnpm install + lint + test` ワークフロー（PR / push to main）
- [ ] `api-build-push-ecr` ワークフロー（Docker ビルド → ECR push）
- [ ] `api-deploy-ecs` ワークフロー（Task Definition 新リビジョン → Service 更新）
- [ ] `cron-deploy-ecs` ワークフロー（同上、Scheduled Task 用）
- [ ] `terraform-plan` ワークフロー（PR）
- [ ] `terraform-apply` ワークフロー（手動 dispatch）
- [ ] `prisma-migrate-deploy` ワークフロー（schema 変更時、ECS RunTask で実行）

### 本番 GitHub 連携

- [ ] **GitHub OAuth App（prod 用）**を作成（`https://app.example.com/api/auth/callback/github` を callback に登録）
- [ ] Secrets Manager に prod 用 `GITHUB_CLIENT_ID/SECRET`、`GITHUB_PAT` を保存

### Sentry 本番接続

- [ ] Sentry の本番 DSN を Secrets Manager / Vercel Env に設定
- [ ] アラート設定（Slack 通知）
- [ ] エラー検知の動作テスト（意図的にエラーを発生させて Sentry に届くか確認）

### 動作確認（本番環境）

- [ ] `https://app.example.com` で web が表示される
- [ ] GitHub ログインが成功する
- [ ] プレイ → スコア保存 → ランキング反映
- [ ] 手動で cron Task Definition (`crawler:run`) を ECS RunTask 起動して動作確認
- [ ] 毎時 `batch:ranking` が EventBridge で起動することを確認
- [ ] S3 に達成カードが保存されることを確認

---

## Phase 10: リリース準備・ローンチ

### 法務・コンプライアンス

- [ ] 利用規約作成
- [ ] プライバシーポリシー作成（GDPR / 個人情報保護法対応）
- [ ] 特定商取引法に基づく表記（広告収益あり）
- [ ] OSS ライセンス表記（フッターに「問題コードの出典ライセンス」へのリンク）

### AdSense 連携

- [ ] Google AdSense アカウント申請（本番ドメインが必要なのでここで実施）
- [ ] AdSense 審査通過後、広告ユニット作成
- [ ] Vercel Env に `ADSENSE_PUB_ID` を設定
- [ ] 本番で広告が表示されることを確認
- [ ] AdSense ダッシュボードで impression / CTR / RPM の表示確認

### テスト

- [ ] E2E テスト（Playwright）
  - [ ] ゲストプレイ → リザルト
  - [ ] GitHub ログイン → プレイ → ランキング反映
  - [ ] 神々モード → リザルト
  - [ ] リプレイ閲覧
  - [ ] 特典獲得（グレードアップ）
- [ ] 負荷テスト（k6 / Artillery）
  - [ ] 同時 100 セッション、同時 1000 リクエスト
  - [ ] 集計バッチの実行時間計測
- [ ] セキュリティ監査
  - [ ] スコア改ざんが拒否されることの確認
  - [ ] paste イベントが無効化されていることの確認
  - [ ] OAuth state cookie 検証の動作確認
  - [ ] httpOnly cookie の動作確認

### ローンチ前準備

- [ ] **問題プールのブートストラップ運用**
  - [ ] `CRAWLER_REPOS_PER_RUN=10` でクローラを 1 日 1 回 5〜10 日連続実行
  - [ ] 各言語 30〜50 repo の `disabled=false AND storedCount > 0` を確保
  - [ ] 終了後に `CRAWLER_REPOS_PER_RUN=1` に戻す
- [ ] 監視ダッシュボード設定（Sentry / CloudWatch / Vercel Analytics）
- [ ] アラート設定（Slack 通知）
- [ ] バックアップ確認（RDS 自動バックアップが効いているか）
- [ ] DNS 切替手順の確認

### ローンチ

- [ ] プロダクト紹介記事（Zenn / Qiita）
- [ ] X / Reddit でローンチ告知
- [ ] Hacker News / Product Hunt 申請（任意）
- [ ] 初日のアクセス・エラー・収益の監視
- [ ] 翌週からの定常運用へ移行

---

## 進捗管理ルール

- 各タスクの状態：
  - `[ ]` 未着手
  - `[~]` 進行中
  - `[x]` 完了
- 着手時は **必ず該当 spec を再読** して、設計変更があれば spec を先に更新
- Phase を跨ぐ並行作業は OK（例：Phase 3 のクライアント実装と Phase 4 の API 実装は並行可能）
- 完了したらこのファイルを更新してコミット
- **Phase 9（インフラ構築）に入るまでは AWS / Vercel / Sentry / AdSense にアクセスしない**（無駄な課金と認知負荷を避ける）
