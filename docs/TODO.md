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
- [x] `apps/cron/.env.local` を dotenvx で暗号化作成（apps/api と同じパターン、`.env.keys` は root から symlink）
- [x] `pnpm dev` で web / api / Postgres / Redis が同時起動できることを確認
- [x] ~~Sentry のローカルダミー DSN 設定~~ Sentry はプロジェクト全体から削除済み（観測は logger.error → CloudWatch Logs Insights で行う方針）
- [x] `apps/api` に `/healthz` エンドポイント追加 ← 既存の `GET /api/health` (liveness) と `GET /api/health/ready` (readiness) で要件充足。ALB / ECS のヘルスチェックパスは Phase 9 でターゲットグループ設定時にこちらを指定する

### GitHub 連携の最小準備（ローカルテスト用）

- [x] **GitHub OAuth App（dev 用）**を作成（`http://localhost:3000/api/auth/callback/github` を callback に登録）
- [x] GitHub PAT 発行（クローラ用、運営アカウント。**`public_repo` スコープのみ**）
- [x] `.env.local` に `GITHUB_CLIENT_ID/SECRET` を記載（dotenvx 暗号化）
- [x] `apps/cron/.env.local` に `GITHUB_PAT` を追記（dotenvx 暗号化）

> AWS / Vercel / Google AdSense 等のアカウント設定は **Phase 9 で実施**。Phase 0〜8 はすべてローカルで完結。

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
- [x] `POST /api/auth/refresh`、`POST /api/auth/logout`、`GET/PATCH/DELETE /api/me` の動作確認（既存共用）
- [ ] `POST /api/play-sessions/claim` 新規（ゲストプレイのバッファをアカウント紐付け、Phase 3 と並行可）← ゲストプレイは IndexedDB バッファ自体が Phase 3 で deferred
- [x] 単体テスト（auth-service / github-oauth）

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
- [x] httpOnly cookie に JWT が保存されることを確認
- [x] refresh token が Redis に保存されることを確認
- [x] アカウント削除で User / AuthAccount / refresh token が全削除されることを確認（test/controller/user/delete.test.ts で網羅）

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

- [x] `apps/cron/` 初期構成（`package.json` / TypeScript / 共通ロガー / dotenvx）
- [x] GitHub Search API クライアント実装（言語 / ライセンス / stars / pushed フィルタ）
- [x] GitHub Repos API クライアント実装（description / homepage / topics 取得）
- [x] GitHub Tree / Raw API クライアント実装（ファイル取得）
- [x] `processRepo(target)` メイン関数：メタ取得 → ファイル取得 → AST → 関数抽出
- [x] **TypeScript Compiler API による AST 解析**
  - [x] `ts.createSourceFile` でファイル解析
  - [x] FunctionDeclaration / ArrowFunctionExpression / FunctionExpression / MethodDeclaration を抽出
  - [x] 行範囲取得（`sourceFile.getLineAndCharacterOfPosition`）
- [x] **コメント除去ロジック**（`forEachLeadingCommentRange` / `forEachTrailingCommentRange`）
- [x] 採用条件チェック（文字数 / 非 ASCII / 行長 / 関数名）
- [x] AST 正規化ハッシュで重複排除
- [x] repo 単位の足切り（採用候補 30 個以上で disabled=false / storedCount=保存件数、ランダムサンプリング最大 100 個）
- [x] `crawler_runs` への結果記録 ← 同日二重起動防止は持たない方針に変更（本処理がべき等：`pickNextRepo` の登録済みスキップ + `@@unique([languageId, astHash])`）。orphan running は次回 run 冒頭の `markStaleAsFailed` で 30 分以上経過した行を failed に倒して回収
- [x] 失敗時のハンドリング（HTTP 5xx / 404 / レート制限）
- [x] `pickNextRepo()` 実装（Search 結果から未登録の最上位 repo を選定）
- [x] CLI エントリポイント `pnpm crawler:run:typescript` ← **言語別 task に分割**（AST 抽出層が言語固有なため。新言語追加時は `crawler-run-<slug>.ts` をコピー、Phase 2 ローンチ時点では TypeScript のみ）
- [x] 月次ライセンス再検証 CLI `pnpm crawler:license-recheck`
- [x] ~~Sentry 連携~~ Sentry はプロジェクト全体から削除済み（観測は logger.error → CloudWatch Logs Insights）
- [x] graceful shutdown（`setupGracefulShutdown(prisma)` で SIGTERM / SIGINT を受けて Prisma を disconnect）
- [x] service / Repository / client の DI パターン統一（`repo: { ...Repository }` + `client: { ...Client }` を別オブジェクトで渡す）

### 動作確認（ローカル）

- [x] ローカル環境で `pnpm crawler:run:typescript` を 1 repo 処理してみる（**2026-06-06 確認**：freeCodeCamp/freeCodeCamp を 2 分 58 秒で完走）
- [x] `crawled_repos` / `problems` テーブルに正しくデータが入ることを確認（candidatesCount=501、storedCount=100、disabled=false）
- [x] `sourceUrl` が GitHub の行範囲ハイライト付き URL になっていることを確認（`github.com/.../blob/{sha}/path#L{start}-L{end}`）
- [x] コメント除去後のコードを目視確認（関数本体のみ、TS 型注釈は保持）
- [x] graceful shutdown 動作確認（SIGTERM で `prisma.$disconnect()` ログ → exit 0）
- [ ] **ローカルでブートストラップ実行**：`CRAWLER_REPOS_PER_RUN=5` で 5〜10 repo 一気に積み上げる動作確認
- [x] 失敗時のリトライ・disabled 化の挙動確認（test/service/crawler-service の正常系/異常系で網羅）
- [x] **言語別ファイル拡張子の分離** (**2026-06-06 修正**): `GithubClient` のコンストラクタ引数で `targetExtensions: RegExp` を受け取る形に変更。TypeScript task では `/\.(ts|tsx)$/` を指定。listSourceFiles で未指定の場合は throw する。**動作確認**: 2 回目実行で vuejs/vue を選んで 100 problems 抽出、すべて `.ts/.tsx` で `.js/.jsx` は 0 件

---

## Phase 3: タイピングコアエンジン（通常モード）

参照：[`docs/spec/typing-engine/`](docs/spec/typing-engine/README.md)

### DB スキーマ追加

- [x] `play_sessions` テーブル定義（`crawledRepoId`, `mistypeStats` 等含む。`flagged` / `repoFallback` は MVP では持たず deferred）
- [x] `play_session_problems` テーブル定義
- [x] `keystroke_logs` テーブル定義（gzip bytea）
- [x] Prisma マイグレーション（`20260607023454_typing_engine_initial`）

### apps/api 実装（ソロモード）

- [x] `POST /api/play-sessions/solo` Controller
  - [x] `disabled=false AND storedCount > 0` の repo からランダム 1 選定
  - [x] 20 問抽出（既存問題のシャッフル）
  - [x] `repoInfo` 構築
  - [x] Redis にステート保存（TTL 5 分）
- [x] `POST /api/play-sessions/:id/finish` Controller
  - [x] Redis ステート取得
  - [x] `score = typedChars × accuracy` 計算
  - [x] スコア上限チェック（120 秒で 1500 文字超 → HTTP 400）
  - [x] 認証済みなら DB 保存、ゲストならスキップ
  - [x] サーバー側で `mistypeStats` 集計（keystroke log から）
  - [x] `user_lifetime_stats` 更新（`totalTypedChars`、`bestScore` 等）
  - [x] Redis ステート削除
- [x] keystroke log を gzip 圧縮して保存
- [x] paste イベント検知（クライアント側、サーバーで二重チェック不要）

### apps/web 実装（通常モード UI）

> **UI は [`docs/mocks/`](docs/mocks/) のモックを参照**：`top.html` / `language-select.html` / `play.html` / `result.html`。

- [x] **デザインシステム移植** (PR #23): `docs/mocks/styles.css` を `apps/web/src/app/globals.css` に統合 + JetBrains Mono フォント + 共通 Topbar コンポーネント + ブランド「Typing Royale」化
- [x] トップ画面（言語選択への導線）← `docs/mocks/top.html` (PR #23, hero と言語選択カードを統合)
- [x] 言語選択画面（TypeScript / JavaScript の 2 ボタン）← `docs/mocks/language-select.html` (PR #23)
  - [x] **「神々に挑戦」ボタン**も配置（Phase 5 で有効化、現状 disabled でゴールド演出）
- [x] 「今日の挑戦」スプラッシュ画面（repo 名 + Star 数 + description、2 秒表示）(PR #23)
- [x] **プレイ画面**（コアコンポーネント）← `docs/mocks/play.html` (PR #23)
  - [x] コード表示（打鍵済み / 現在位置 / 未打鍵で色分け、Dracula 配色）
  - [x] キー入力ハンドリング（1 文字判定、誤入力時の進行ロック）
  - [x] paste イベント無効化
  - [x] 120 秒カウントダウン（`requestAnimationFrame` + `performance.now()`）
  - [x] 累計文字数・正確率の表示（HUD 4 cell）
  - [x] 関数完走時の自動次問題遷移
  - [x] **20 問完走時の「お見事！」表示**（タイマー継続）
  - [x] サイドに repo 名・関数名を控えめ表示（code-block-source バー）
  - [x] IME ON 検知 → 警告表示
- [x] **キーストロークログ記録**（`KeystrokeLogs` 配列、`{ elapsedMs, inputChar, isCorrect, problemIndex }`）(PR #22 で型決定 / PR #23 で蓄積)
- [x] **リザルト画面**（基本版、順位は Phase 4 で）← `docs/mocks/result.html` (Phase 4 完了後の最新版で順位表示も入れ込み済み)
  - [x] スコア・累計文字数・正確率・出題数 / 完走数（4 stat）
  - [x] 「今回のリポジトリ」カード（`repoInfo` から）
  - [x] ニガテ文字（`mistypeStats` 上位 5〜10）
  - [x] シェアボタン（X intent URL）
  - [x] エンジニアグレード進捗（暫定、`apps/web/src/libs/grade.ts` の純粋関数）
  - [x] ランキング placeholder（GET /api/rankings/me は Phase 4 で実装後に有効化）

### apps/web 共通 UI (TODO.md には個別記載していなかったが本 step で実装)

- [x] **マイページ概要画面** mock 準拠で再実装 ← `docs/mocks/mypage.html` (本 step5、グレード / ベストスコア / ランキング / 履歴は Phase 4 待ちで placeholder)
- [x] **マイページ設定画面** mock 準拠で再実装 ← `docs/mocks/mypage-settings.html` (本 step5)
- [x] **サインイン画面** mock 準拠で再実装 ← `docs/mocks/modal-login.html` (本 step5、modal ではなく単独ページ版)
- [x] **オンボーディング画面** mock 準拠で再実装 ← `docs/mocks/onboarding.html` (本 step5)

### ゲストプレイ対応

- [ ] IndexedDB に一時バッファ保存（リザルト画面表示中のみ）← **Phase 2 (API ゲスト対応) 完了まで延期**
- [ ] 「ログインして記録を残す」ボタン → OAuth → `/api/play-sessions/claim` ← 同上
- [ ] ログイン拒否 / 画面離脱時の IndexedDB 即時削除 ← 同上

### 動作確認（ローカル）

- [x] ローカルで言語選択 → スプラッシュ → 120 秒プレイ → リザルトの一連の流れ
- [x] サーバー側で `play_sessions` / `keystroke_logs` / `mistypeStats` が正しく保存される
- [ ] ゲストでプレイ → ログイン → アカウントに紐付くフローの確認 ← IndexedDB バッファ自体が MVP 後 deferred
- [ ] 寿司打と並走テストでタイピング体感を比較

---

## Phase 4: スコア・ランキング + エンジニアグレード

参照：[`docs/spec/score-ranking/`](docs/spec/score-ranking/README.md)

### DB スキーマ追加

- [x] `user_lifetime_stats` テーブル定義（`bestScore`, `currentGrade`, `currentGradeReachedAt`, `lifetimeMistypeStats` 等含む）
- [x] `user_language_best` テーブル定義（リアルタイム集計用、`ranking_snapshots` cron は MVP では不要）
- [x] Prisma マイグレーション

### apps/api 実装（ランキング）

- [x] **`user_language_best` を ORDER BY して都度集計するリアルタイム方式に変更**（cron バッチ不要、`docs/spec/score-ranking/README.md` 参照）
- [x] `GET /api/rankings` Controller（言語別トップ 10）
- [x] `GET /api/rankings/me` Controller（順位 + grade + next_grade を返す）
- [x] `GET /api/players/:userId` Controller（プレイヤー詳細）

### グレード判定ロジック

- [x] `GRADES` 定数定義（Intern → Fellow の 8 段階、`apps/api/src/lib/grade.ts`）
- [x] `calcGrade(bestScore)` 関数実装
- [x] `/finish` 時の `bestScore` 更新時にグレード再判定
- [x] `currentGrade` / `currentGradeReachedAt` 更新
- [x] グレードアップ時はレスポンスに `grade_up: { from, to }` を含める

### apps/web 実装

> **UI は [`docs/mocks/`](docs/mocks/) のモックを参照**：`ranking.html` / `player-detail.html` / `mypage.html`。

- [x] ランキング画面（言語タブ切替、トップ 10 表示、自分の順位 or 「圏外」表示）← `docs/mocks/ranking.html`
- [x] プレイヤー詳細ページ ← `docs/mocks/player-detail.html`
- [x] **リザルト画面拡張**：
  - [x] 「現在のエンジニアグレード」表示（即時）
  - [x] 次グレードまでの進捗バー
  - [x] 順位の即時表示（リアルタイム集計）
  - [x] グレードアップ時の祝賀演出
- [x] **マイページ > ホーム画面**：
  - [x] グレード大表示 + 進捗バー
  - [x] ベストスコア / 全期間順位 / 累計打鍵数
  - [ ] 連続日数 / グレード昇格履歴 ← deferred (lifetimeStats.streakDays 自体は記録あり、表示のみ未実装)

### 動作確認（ローカル）

- [x] プレイ → DB 保存 → ランキング画面に即時反映
- [x] グレードアップ時の挙動確認（リザルト演出 + マイページ反映）
- [x] 圏外ユーザーの UX 確認（順位の代わりにグレード進捗）
- [x] `publicRanking=false` 切り替えでランキングから除外されることを確認

---

## Phase 5: 神々モード・キーストロークログ

参照：[`docs/spec/ghost-battle/`](docs/spec/ghost-battle/README.md)

### apps/api 実装

- [x] `POST /api/play-sessions/challenge-gods` Controller
  - [x] オールタイムトップ 10 を `RankingSnapshotRepository.getTopByLanguage` から取得
  - [x] 自分自身を候補から除外、候補 0 件なら 409 Conflict
  - [x] 抽選した神の `play_session_problems` 先頭 20 問取得 (`PlaySessionRepository.findGhostSourceById`)
  - [x] その神のセッションの `crawled_repos` から `repoInfo` を構築
  - [x] 神の `keystroke_logs.compressedLog` を gunzip + JSON.parse (`KeystrokeLogRepository.findByPlaySessionId`)
  - [x] 神セッション or log 取得不可なら次の候補へ（最大候補数分リトライ）
  - [x] Redis に `mode=challenge_gods` + `ghostSessionId` で保存
  - [x] **score-ranking 完成済み**（StubRankingSnapshotRepository は撤去、Prisma 実装で稼働中）
- [x] **`GET /api/ghosts/:playSessionId` Controller は実装しない**（ghost-battle step1 の設計判断で、`/challenge-gods` のレスポンスに `ghost_keystroke_logs` を同梱する方式に最適化。リプレイ視聴は replay-viewer feature の `GET /api/replays/:id` 経由）

### apps/web 実装

> **UI は [`docs/mocks/`](docs/mocks/) のモックを参照**：`play-ghost.html` / `modal-ghost-result.html`。

- [x] 言語選択画面の「神々に挑戦」ボタンを `startPlaySession(_, "challenge_gods")` 経由で `/api/play-sessions/challenge-gods` に接続
  - [x] トップ 10 不在時（HTTP 409）はエラーメッセージで通常モードへ誘導
  - [x] sessionStorage に `ghostKeystrokeLogs / ghostSessionId / ghostUserDisplay / mode` を保存して /play/[sessionId] に引き継ぎ
  - [x] PlayLoop で `mode="challenge_gods"` 時に topbar の modeBadge を「⚡ 神々に挑戦」に
- [x] **神々モードプレイ画面**（ghost-battle step1 完了）：← `docs/mocks/play-ghost.html`
  - [x] HUD に「残り時間 / あなた / 神 / 差」の 4 セル
  - [x] 全 20 問の合計文字数を分母にした race-bar（あなた / 神）
  - [x] サイドに神カード（avatar + グレード + 表示名 + 進捗 + 正確率 + ベスト）
- [x] **ゴースト再生エンジン**（ghost-battle step1 完了）：
  - [x] 既存 120 秒 rAF tick で `ghost_keystroke_logs` を `elapsed_ms` に応じて消費
  - [x] 神の累計文字数 / 現在問題 / 正確率を tick 毎に更新
- [x] **神々戦リザルト画面**（ghost-battle step1 完了）：← `docs/mocks/modal-ghost-result.html`
  - [x] 勝敗 / 累計文字数差 / 正確率差 / 出題シーケンスの達成状況
  - [x] 「もう一度神々に挑戦」「通常プレイへ」（指名対戦不可、ランダム再抽選で言語選択へ戻す）
- [x] **ゴーストデータ取得失敗時の再抽選**（API 側で最大 候補数分リトライ、全失敗で 409）

### 動作確認（ローカル）

- [x] テストユーザー数名でプレイし、トップ 10 のデータを作る（dev seed + `seed-ghost-fixture.ts`）
- [x] 神々モード起動 → ゴーストと併走 → リザルト
- [x] トップ 10 不在時のフォールバック（DB をクリアして検証）
- [x] ゴーストデータ欠落時の再抽選

---

## Phase 6: リプレイ閲覧

参照：[`docs/spec/replay-viewer/`](docs/spec/replay-viewer/README.md)

### DB スキーマ追加

- [ ] `play_sessions.persistReplay (bool)` カラム追加 ← MVP では全 play_session を永続前提のため deferred（cleanup cron が未整備）
- [ ] Prisma マイグレーション

### apps/api 実装

- [x] `GET /api/replays/:playSessionId` Controller (replay-viewer step1)
  - [x] `play_sessions` + `play_session_problems` + `keystroke_logs` + `problems` + `crawled_repos` を組み合わせて返却
  - [x] canPublicRanking=false / keystroke 欠落で 404
  - [ ] HTTP `Cache-Control: public, max-age=604800` ← CDN キャッシュは Phase 9 で
- [x] `GET /api/replays/featured` Controller (replay-viewer step2、Hall of Fame コメント駆動)
- [ ] 毎時バッチでトップ 10 入賞プレイの `persistReplay=true` に更新 ← persistReplay 自体 deferred

### apps/web 実装

> **UI は [`docs/mocks/replay.html`](docs/mocks/replay.html) を参照**。

- [x] **リプレイ画面** (replay-viewer step1)：← `docs/mocks/replay.html`
  - [x] コード表示エリア（コメント除去後の codeBlock）
  - [x] キーストローク再描画エンジン（再生・一時停止・0.5x/1x/1.5x/2x 倍速・シーク）
  - [x] プログレスバーは 120 秒全体
  - [x] 累計文字数 / 正確率 / 経過時間 / 「問題 X / N」表示
  - [x] 出典表示（owner/repo / ライセンス / 関数名 + GitHub リンク）
  - [x] 「GitHub で原文を見る」リンク（sourceUrl の行範囲ハイライト付き）
  - [ ] 問題遷移マーカー表示 ← MVP では割愛、要望出たら追加
- [x] ランキング画面に「▶ 視聴」リンク (replay-viewer step1)
- [x] Hall of Fame 各エントリに「▶ リプレイ」リンク (replay-viewer step2)
- [x] Landing に「✨ 注目のリプレイ」セクション (replay-viewer step2)
- [ ] プレイヤー詳細ページにそのプレイヤーの代表リプレイ一覧 ← /players/[id] は既存だが代表リプレイ一覧は別 step
- [ ] SNS シェアボタン（X / Reddit / Zenn）と OG カード ← 別 step (replay-viewer step3 候補)

### 動作確認（ローカル）

- [x] トップ 10 のリプレイを実際に閲覧
- [x] シーク・倍速の動作確認
- [ ] モバイル閲覧の動作確認（プレイは PC のみ）

---

## Phase 7: 特典（MVP 3 種）

参照：[`docs/spec/rewards/`](docs/spec/rewards/README.md)

### DB スキーマ追加

- [x] `rewards` テーブル定義（`type`: grade_up / card）
- [x] `hall_of_fame_entries` テーブル定義（`comment` + `commentSubmittedAt`、MVP では draft 列なし＝即時公開）
- [x] `badge_configs` テーブル定義（`displayItems` jsonb）
- [x] Prisma マイグレーション

> **UI は [`docs/mocks/`](docs/mocks/) のモックを参照**：`badge-customize.html` / `hall-of-fame.html` / `mypage-rewards.html` / `modal-achievement.html` / `modal-top10-comment.html`。

### 動的 SVG バッジ

- [x] `GET /badge/:username.svg` Controller (rewards step2)
- [x] SVG テンプレート作成（display_items: grade / best_score / rank / streak_days / typed_chars / username）
- [x] バッジカスタマイズ画面（マイページ） (rewards step3) ← `docs/mocks/badge-customize.html`
- [ ] HTTP `Cache-Control: public, max-age=300, stale-while-revalidate=600` ← MVP は no-cache、CDN 最適化は Phase 9 で
- [ ] `badge_configs` 更新時に CDN キャッシュ無効化（同上、本番設定は Phase 9）

### 達成カード PNG

- [x] `satori` + `resvg-js` セットアップ (rewards step6)
- [x] カードテンプレート JSX 作成（グレード別グラデーション）
- [x] `POST /api/rewards/cards` Controller
  - [x] 生成 → LocalCardStorage に保存 / `/cache/rewards/:filename` で静的配信
  - [x] URL 返却（idempotent upsert）
- 達成条件チェック実装：
  - [x] グレードアップ時（/finish で gradeUp 検知時に自動生成）
  - [ ] 累計 10,000 文字 / 100,000 文字 達成時 ← deferred
  - [ ] 初トップ 10 入り時 ← deferred
  - [ ] 7 日連続プレイ達成時 ← deferred
- [ ] 達成通知モーダル（プレイ完了直後）← `docs/mocks/modal-achievement.html` ← deferred（現在はリザルト内の祝賀バナーのみ）

### Hall of Fame

- [x] `GET /api/hall-of-fame` Controller (rewards step4、言語別トップ 10 + 公開コメント)
- [x] `POST /api/hall-of-fame/comments` Controller（本人コメント登録、NG ワードフィルタ）
- [x] `/finish` レスポンスに **`top_ten_boundary_score`** を含める
- [x] **リザルト画面のコメント入力モーダル**：← `docs/mocks/modal-top10-comment.html`
  - [x] `score > top_ten_boundary_score` でモーダル表示
  - [x] 「🏆 TOP 10 入り見込み！」表示
  - [x] 入力内容を即時 `comment` として公開（draft 機構は MVP では持たず）
  - [x] 「あとで書く」スキップ動線
- [ ] **draft → 公開昇格バッチ** ← MVP では draft 機構を持たず即時公開で運用
- [x] **マイページ > Hall of Fame コメント編集**：
  - [x] PATCH /api/hall-of-fame/comments/:entryId で即時反映
- [x] Hall of Fame 画面実装 (rewards step5) ← `docs/mocks/hall-of-fame.html`
- [x] **Hall of Fame 上位 3 名のクラウン + カーテン演出 + 神モーダル** (rewards step7)
- [x] **users.favorite_repo_url** + マイページ設定 + Hall of Fame モーダルでの表示 (rewards step7)
- [x] リプレイへの導線（HoF 各エントリに「▶ リプレイ」リンク、replay-viewer step2）

### マイページ > 特典タブ

- [x] 獲得済み特典の一覧 (rewards step6) ← `docs/mocks/mypage-rewards.html`
- [x] バッジ URL のコピー機能 (rewards step3)
- [x] 達成カード PNG のダウンロード機能 (rewards step6)
- [ ] **Coming Soon プレースホルダ枠**（3D / Lottie / カード / アート / 公式 X 紹介投稿）← deferred

### 動作確認（ローカル）

- [x] SVG バッジをローカルでブラウザ表示確認
- [x] グレードアップで達成カードが自動生成されローカル保存されることを確認
- [x] Hall of Fame のコメント入力 → 即時公開フロー確認

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
