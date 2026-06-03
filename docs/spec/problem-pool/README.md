# 問題プール

GitHub 上の OSS コードから **関数単位でタイピング問題を抽出** し、問題プールに蓄積するサブシステム。**週次 cron で GitHub Star ランキング上位の repo を自動取得**、寛容ライセンスのみフィルタして問題化する **単一パイプライン** で運用負荷を最小化する。

**セッション単位では「1 つの repo から 20 問」を出題する** ことで、リザルト画面で「ちなみに今回のリポジトリは XXX で…」というコメントを自然に挿入できるようにする。

このドキュメントは **仕様（What）** と **設計（How）** を分けて記述する：

- **仕様**：どの repo からどんな関数が問題プールに入るか、どんなメタ情報がぶら下がるか、セッションでどう抽選されるか
- **設計**：cron スケジューラの構成、AST 解析パイプライン、GitHub API レート制限対応、コメント除去の実装

## 関連 spec

- [`../typing-engine/README.md`](../typing-engine/README.md) — 本プールの消費者。`/solo` でランダム抽選される
- [`../ghost-battle/README.md`](../ghost-battle/README.md) — `/challenge-gods` で神の repo を継承

## 目次

- [仕様](#仕様)
  - [運用方針：週次 cron による完全自動化](#運用方針週次-cron-による完全自動化)
  - [取得元の選定](#取得元の選定)
  - [言語ごとの cron](#言語ごとの-cron)
  - [対応言語（MVP）](#対応言語mvp)
  - [関数の抽出単位](#関数の抽出単位)
  - [問題として採用する条件](#問題として採用する条件)
  - [コメントの除去ポリシー](#コメントの除去ポリシー)
  - [出典情報の保存（ファイル・行範囲）](#出典情報の保存ファイル行範囲)
  - [ライセンス管理](#ライセンス管理)
  - [セッション単位の repo 抽選ルール](#セッション単位の-repo-抽選ルール)
  - [repo メタ情報の取得](#repo-メタ情報の取得)
- [設計](#設計)
  - [クローラ Cron の構成](#クローラ-cron-の構成)
  - [AST 解析パイプライン](#ast-解析パイプライン)
  - [コメント除去の実装](#コメント除去の実装)
  - [行範囲の取得実装](#行範囲の取得実装)
  - [GitHub API レート制限対応](#github-api-レート制限対応)
  - [月次ライセンス再検証バッチ](#月次ライセンス再検証バッチ)
- [必要な画面](#必要な画面)
- [必要な API](#必要な-api)
- [必要な DB 設計](#必要な-db-設計)
- [フロー図](#フロー図)
- [注意事項](#注意事項)

---

## 仕様

### 運用方針：週次 cron による完全自動化

- **週 1 回のバッチで 1 つの repo だけを処理する** 軽量運用。1 失敗 = 1 週ロスのみで、サービスへの影響は最小化される。
- 手動でのキュレーション作業は **行わない**。
- 処理順は **GitHub Star ランキング上位から sequential**（`crawled_repos.crawlOrder` で進捗管理）。
- 一度処理した repo は **再クロールしない**（プールは累積、上書きしない）。
- バッチが失敗してもアプリは既存のプールで動作し続ける。
- **ローンチ初期のみ** 環境変数 `CRAWLER_REPOS_PER_RUN`（デフォルト 1）で 1 回の処理 repo 数を一時的に増やせる。例：最初の 1〜2 週は 5 にして 1 日 5 repo 処理 → 50 repo まで一気に積み上げてから 1 に戻す。

### 取得元の選定

GitHub Search API を使い、以下の条件で repo を **対象候補リスト** としてリストアップ：

- 言語：`language:TypeScript`（TypeScript 用 cron の場合）
- ライセンス：`license:mit` / `license:apache-2.0` / `license:bsd-3-clause` / `license:bsd-2-clause`
- スター数：`stars:>1000`
- アーカイブ済み除外：`archived:false`
- 最終更新：`pushed:>{6 ヶ月前}`（メンテナンス中の repo に絞る）
- ソート：`sort=stars-desc`

候補リスト取得は **毎週の cron 実行時に都度叩く**（リストはサーバー側で保持しない）。Star ランキングは時間で変動するため、毎週「現在の上位リスト」を取得し、その中から **まだクロールしていない最上位 repo** を選ぶ。

進捗管理：

- `crawled_repos` テーブルが「すでに処理済み（成功 / 失敗 / 不適格）」の repo を保持。
- 新しい cron 実行時：Search API のレスポンスから `crawled_repos` に未登録のものを上から順に 1 つ取り出す。

### 言語ごとの cron

- **言語別に独立した cron** を運用する（TypeScript 用 / JavaScript 用 / 将来追加分）。AST 抽出ルール・関数ノード判定が言語固有のため、cron 実装も分離する。
- 本ドキュメントは **TypeScript 用 cron を例として記述** する。JavaScript / Go 等は同型の cron を別途実装する（言語固有の AST 抽出層は本仕様の対象外）。

### 対応言語（MVP）

- TypeScript
- JavaScript

両言語とも TypeScript Compiler API で AST を構築できるが、上述のとおり **cron 自体は言語ごとに別実装** とする。AST 抽出層は言語固有の処理を持つ。

### 関数の抽出単位

各 repo の `.ts` / `.js` ファイルを取得し、AST から次のノードを **関数の問題候補** として抽出する：

- `FunctionDeclaration`：`function foo(...) { ... }`
- `ArrowFunctionExpression`：`const foo = (...) => { ... }` / `const foo = (...): T => { ... }`
- `FunctionExpression`：`const foo = function (...) { ... }`
- `MethodDefinition` / `MethodDeclaration`：クラス内メソッド

抽出されたコードはソース上の原文（フォーマット・空白を保持）を **そのまま** 取り出す（フォーマッタは通さない）。インデントレベルはトップレベル基準に正規化する。

ネストされた内側の関数（クロージャ内のアロー関数等）は **抽出対象外**。

> **依存型の同梱は MVP では行わない**。関数本体のみを問題化する。未解決の型名は問題テキストにそのまま現れる。

### 問題として採用する条件

抽出した関数のうち、以下を満たすものを **採用候補** とする：

- **コメント除去後** の関数本体の文字数が **80 文字以上 1500 文字以下**
- 非 ASCII 文字（全角コメント等）を含まない
- 1 行の長さが 120 文字を超える行を含まない
- 関数全体がコメントのみではない（コメント除去後に空にならない）
- 関数名が存在する（無名関数は除外、ただし `const foo = ...` 形式の代入は名前ありとして扱う）
- AST 正規化後のハッシュで同一 repo 内の重複排除

**repo 単位の保存ルール**：

- 採用候補が **30 個未満** の repo は `crawled_repos.eligible=false` として記録し、`problems` には何も保存しない。次回以降のクロール対象からも外れる。
- 採用候補が **30 個以上** の repo は `eligible=true` として記録し、採用候補から **ランダムサンプリングで最大 100 個** を `problems` に保存。
  - 候補が 30〜100 個の場合：全件保存
  - 候補が 100 個超の場合：ランダムに 100 個を選んで保存

100 個キャップの根拠：

- 単一 repo が問題プールを支配しないようにする
- セッションあたり 20 問なので、100 問あれば同一 repo を繰り返しプレイしても飽きにくい
- DB サイズと出題の多様性のバランスポイント

### コメントの除去ポリシー

問題テキストには **コメントを一切含めない**。これにより：

- 「コメントを延々打たされる」という体験を防ぐ
- 関数本体のロジックに集中できる
- 関数長の判定基準が安定する（コメント量で揺れない）

除去対象：

- **JSDoc / ブロックコメント** `/** ... */` `/* ... */`
  - 関数の直前に置かれたものも含めて全削除
- **行コメント** `// ...`
- **行末コメント**（例：`const x = 1 // 初期化`）
- **TypeScript の 3 スラッシュディレクティブ** `/// <reference ...>`

除去 **しない** もの：

- 文字列リテラル内の `//` や `/* */`（例：URL `"https://..."` やテンプレートリテラル内の擬似コメント）
- 正規表現リテラル

コメント除去後、**連続する空行は 1 行に折り畳む**（コメント跡地の空白が目立たないように）。

### 出典情報の保存（ファイル・行範囲）

各問題には、元のコードを GitHub 上で特定できる以下の情報を保存する：

| フィールド | 例 | 用途 |
| --- | --- | --- |
| `sourceRepo` | `"colinhacks/zod"` | プレイ画面・リプレイで出典表示 |
| `sourceFilePath` | `"src/parse.ts"` | 同上 |
| `sourceLineStart` | `123` | コメント **除去前** の元ファイルでの開始行（1-indexed） |
| `sourceLineEnd` | `145` | 同 終了行 |
| `sourceCommitSha` | `"a1b2c3..."` | 後からファイルが変わっても元バージョンを保証 |
| `sourceUrl` | `https://github.com/colinhacks/zod/blob/a1b2c3/src/parse.ts#L123-L145` | プレイ・リプレイ画面からワンクリックで該当箇所を開ける GitHub URL |

行範囲は **コメント除去前の元ファイル基準** で保存する。理由：GitHub 上でユーザーが見たときに「ここが問題のコードだ」と分かることが重要だから。

### ライセンス管理

- 採用ライセンス：**MIT / Apache-2.0 / BSD-2-Clause / BSD-3-Clause**。
- GitHub Search の `license:` フィルタに加えて、各ファイル取得時に **ファイル先頭のライセンスヘッダ** も最善努力で確認（個別ファイルが別ライセンスのケースをカバー）。
- 各問題に `license`, `sourceRepo`, `sourceFilePath`, `sourceLineStart`, `sourceLineEnd`, `sourceCommitSha`, `sourceUrl`, `functionName` を保存。
- プレイ画面・リプレイ画面に「出典 repo / ファイル / 行範囲 / ライセンス名 / コミット SHA / 関数名」を表示。
- ライセンス全文への参照リンクをフッターに掲載。
- 月次でライセンス変更検知バッチを回す（取得済み repo のライセンスが変更されていないか確認）。

### セッション単位の repo 抽選ルール

ソロモード（`POST /api/play-sessions/solo`）開始時、サーバーは以下の手順で出題する：

1. `languageId` に紐づく `crawled_repos` から `eligible=true` の repo を抽出
2. その中からランダムに 1 repo を選定（**クールダウン等は行わない、純粋ランダム**）
3. その repo の `problems` から **20 問をランダム抽出**
4. **fallback**：選んだ repo の問題数が 20 未満なら、同言語の他 `eligible` repo から不足分を補填（このときレスポンスの `repoInfo.fallback=true` をセット）
5. レスポンスに `repoInfo`（後述）と 20 問を同梱

同じ repo が連続することは確率的にあり得るが、50 repo / 言語あれば実用上の偏りは発生しないと判断する。

「神々に挑戦」モードでは抽選を行わず、神が打った session の repo をそのまま継承する（[`../ghost-battle/README.md`](../ghost-battle/README.md) 参照）。

### repo メタ情報の取得

リザルト画面のコメント「ちなみにこのリポジトリは…」を成立させるため、クローラ実行時に各 repo のメタ情報を GitHub API から取得し `crawled_repos` に保存する：

- `description` — repo の説明文（GitHub の「About」欄）
- `homepage` — 公式サイト URL（存在する場合）
- `topics` — タグ配列（例：`["typescript", "schema", "validation"]`）

これらは `GET /repos/{owner}/{repo}` 1 回の API 呼び出しで取得可能。手動キュレーションは不要。

`/solo` `/challenge-gods` のレスポンスに同梱される `repoInfo`：

```ts
type RepoInfo = {
  owner:       string         // "colinhacks"
  repo:        string         // "zod"
  stars:       number         // 35000
  description: string         // "A type-safe schema validation library"
  homepage:    string | null  // "https://zod.dev"
  topics:      string[]       // ["typescript", "schema", "validation"]
  fallback:    boolean        // 20 問足切りで他 repo から補填した場合 true
}
```

---

## 設計

### クローラ Cron の構成

#### スケジュールと実行環境

- **スケジュール**：毎週月曜 03:00 JST。GitHub API の負荷が比較的低い時間帯。
- **実行環境**：API サーバとは別プロセス（`apps/crawler-ts` のような言語別の独立ワーカー想定）。Kubernetes CronJob / AWS EventBridge + Lambda / 単純な Node プロセス + node-cron など、インフラに応じて選択。
- **実行時間目安**：1 repo の処理は数秒〜数分（メタ取得 + ファイル取得 + AST 走査）。タイムアウトは 10 分に設定。

#### 1 回の処理内容

1 回の cron 実行で **`CRAWLER_REPOS_PER_RUN` 個（デフォルト 1）の repo を処理** する。複雑なジョブキュー・並列化は **不要**（シンプルな逐次処理で完結）。

```
for i in 1..CRAWLER_REPOS_PER_RUN:
    target = pickNextRepo()       # GitHub Search + crawled_repos 突き合わせ
    if target == None: break       # 候補なし、終了
    result = processRepo(target)   # メタ取得 → AST → 採用判定 → 保存
    recordRun(target, result)      # crawler_runs に履歴
```

`pickNextRepo()`：

1. GitHub Search API で「言語 × ライセンス × stars>1000 × pushed>6ヶ月 × stars-desc」の上位 repo リストを取得
2. `crawled_repos` テーブルにすでに登録済みの repo は除外
3. 残った中の最上位 repo（Star 数最大）を返す
4. 候補なしなら `None` を返して当週は終了

#### ブートストラップ運用

- 環境変数 `CRAWLER_REPOS_PER_RUN`（デフォルト 1）で 1 回の実行 repo 数を制御。
- ローンチ初期は `CRAWLER_REPOS_PER_RUN=5` のようにして 1 週に 5 repo 処理 → 50 repo まで一気に積み上げてから 1 に戻す運用が可能。
- コード変更不要、ENV だけで切り替え。

#### リトライとエラーハンドリング

- 失敗した repo は **当週リトライしない**（次週は次の repo に進む）。
- 失敗した repo は `crawled_repos` に `disabled=true` で記録し、再度クロール対象にはしない（運営判断で明示的に再開する場合のみ CLI から）。
- リトライ対象外のエラー：HTTP 404（repo 消失）、ライセンス変更検知（`disabled=true` で終了）、AST 解析エラー。
- HTTP 5xx・レート制限は当週限りの失敗として処理。次週は別 repo から開始。

#### 排他制御

- 1 repo / 週の軽量運用なので **分散ロック不要**。
- ただし、cron が想定外に重複起動するケースを防ぐため、`crawler_runs` テーブルに同日の `running` レコードが既にあればスキップする簡易チェックは入れる。

#### モニタリングと通知

- 各実行で `crawler_runs` テーブルに記録：
  - 処理した repo の `owner/repo`、`status(success/failed/skipped)`、`problemsAdded`、`startedAt`、`finishedAt`、`errorMessage`
- 運営は SQL で直接参照、または将来的に簡易ダッシュボード化。
- **連続 2 回失敗**（直近の 2 件の `status=failed`）で Slack 通知する仕組みは別途整備。

#### 管理 API は持たない

- 外部公開する HTTP エンドポイントは作らない。
- 運営オペレーション（特定 repo の再クロール、`disabled` 化、進捗確認）は **CLI ツール** で行う。CLI は DB / GitHub に直接アクセスする独立コマンド。

### AST 解析パイプライン

`processRepo(target)` の中で、各 `.ts` ファイル（TypeScript cron の場合）に対して：

1. `ts.createSourceFile(filePath, source, ScriptTarget.Latest, true, ScriptKind.TS)` で AST 構築
2. `ts.forEachChild` で再帰的に走査
3. `FunctionDeclaration` / `ArrowFunctionExpression` / `FunctionExpression` / `MethodDeclaration` を抽出
4. 各関数ノードに対して：
   - 行範囲を取得（[行範囲の取得実装](#行範囲の取得実装)）
   - 関数本体テキストを取得（コメント除去前）
   - コメント除去（[コメント除去の実装](#コメント除去の実装)）
   - 採用条件チェック
   - AST 正規化ハッシュで重複判定
5. **repo 内の全採用候補を集めてから判定**：
   - 30 個未満 → `eligible=false` で `crawled_repos` 更新、`problems` には何も保存せず終了
   - 30 個以上 → ランダムサンプリングで最大 100 個を `problems` に挿入、`eligible=true`

**ファイルサイズ上限**：1 ファイル 100KB を超えるものは AST 構築前にスキップ（バンドル済みコード / minify 済みファイル除外）。

**JavaScript / その他言語の cron**：本ドキュメントは TypeScript 用 cron の設計。JavaScript / Go 用の cron は同型のフローを持つが、AST 抽出層は言語固有の実装（`ts.createSourceFile` の代わりに各言語のパーサを使う）。本仕様の対象外。

### コメント除去の実装

TypeScript Compiler API のコメント情報は **トリビア（trivia）** として AST ノードに紐づいている。除去手順：

1. 関数ノード全体のテキストを取得（`node.getFullText()` ではなく `node.getText()`、これでも leading trivia は含まれる）
2. `ts.forEachLeadingCommentRange(text, pos, callback)` / `ts.forEachTrailingCommentRange(text, pos, callback)` で全コメント範囲を列挙
3. 列挙された範囲を **後ろから削除**（前から消すと位置がズレるため）
4. 文字列リテラル・正規表現内の `//` `/*` はコメントトリビア扱いされないので自動的に保護される
5. 削除後、`/\n{3,}/g` を `\n\n` に置換して連続空行を折り畳む

このため、`codeBlock` に保存される文字列は **コメント除去後** のテキスト。元ファイル上の行範囲（`sourceLineStart` / `sourceLineEnd`）は **除去前** の位置を保存する（GitHub 上で見たときの位置を保証するため）。

### 行範囲の取得実装

```ts
const sourceFile = ts.createSourceFile(...)
const start = node.getStart(sourceFile)
const end = node.getEnd()

const { line: lineStart } = sourceFile.getLineAndCharacterOfPosition(start)
const { line: lineEnd }   = sourceFile.getLineAndCharacterOfPosition(end)

// TypeScript Compiler API は 0-indexed なので 1-indexed に変換
const sourceLineStart = lineStart + 1
const sourceLineEnd   = lineEnd + 1
```

GitHub の URL 生成：

```
https://github.com/{owner}/{repo}/blob/{commitSha}/{filePath}#L{sourceLineStart}-L{sourceLineEnd}
```

これで **GitHub 上で該当範囲がハイライト表示** された状態で開ける。

### GitHub API レート制限対応

1 週 1 repo の超軽量運用なので **レート制限を意識する必要はほぼない** が、念のため：

- 認証なし：60 req/h、OAuth トークン経由：5000 req/h。バッチには **運営アカウントの Personal Access Token** を使用。
- Search API は 30 req/min、最大 1000 件まで。1 回の cron 実行で 1 リクエスト程度。
- Tree / Raw / Repos API は OAuth 経由で 5000 req/h。1 repo × 数十ファイルなら 50〜100 リクエストで余裕。
- ブートストラップ運用（`CRAWLER_REPOS_PER_RUN=5` 等）でも 1 回あたり数百リクエストに収まる。
- レート制限ヒット時はその repo を当週失敗扱いにし、次週次の repo に進む（同 cron 内でリトライしない）。

### 月次ライセンス再検証バッチ

- 別の cron として毎月 1 回実行。
- `crawled_repos` の各 repo に対して `GET /repos/{owner}/{repo}` を呼び、`license.spdx_id` が採用ライセンス内に収まっているか確認。
- 変更があれば該当 repo の `disabled=true`、紐づく `problems` も `disabled=true` に。
- ランキングへの影響を最小化するため、変更検知時は運営に Slack 通知。

---

## 必要な画面

| 画面 | 概要 |
| --- | --- |
| （なし） | ユーザー向け画面はなし。問題ソースの選択 UI は廃止（言語選択のみで開始） |
| 管理 CLI（運営向け） | 取得状況の確認・問題の手動無効化（不適切表現を含む等のケース）・特定 repo の手動再クロール |

## 必要な API

| メソッド | パス | 説明 |
| --- | --- | --- |
| （内部） | – | `POST /api/play-sessions/solo` から呼ばれ、`languageId` を受け取り、**1 つの repo をランダム抽選 + その repo から 20 問抽出 + `repoInfo` 構築** を行う内部関数。クライアント向け単体 API は持たない |
| GET | `/api/problems/:id` | 問題の詳細（リプレイ画面で利用）。レスポンスに `sourceUrl`（行範囲付き GitHub URL）も含む |

**管理 API は持たない**。運営オペレーション（個別問題の無効化、特定 repo の再クロール、進捗確認）は **CLI ツール** で行う（DB / GitHub に直接アクセスする独立コマンド）。

クローラジョブも cron で直接 DB / GitHub API を叩く独立ワーカー（API サーバ経由しない）。

## 必要な DB 設計

| テーブル | 主要カラム | 説明 |
| --- | --- | --- |
| `languages` | `id`, `name`, `slug` | 言語マスタ（TS / JS） |
| `crawled_repos` | `id`, `languageId`, `owner`, `repo`, `stars`, `license`, `defaultBranch`, `description`, `homepage(nullable)`, `topics(jsonb)`, `eligibleProblemCount`, `eligible(bool)`, `crawledAt`, `disabled(bool)`, `createdAt` | 処理済み repo（成功 / 不適格 / 失敗 すべて）。`eligible=true` は採用候補 30 個以上 → 最大 100 個保存された repo（`/solo` の抽選対象）。`description` / `homepage` / `topics` はリザルト画面のコメント生成用。`disabled=true` は失敗 / ライセンス変更等で除外された repo |
| `problems` | `id`, `languageId`, `crawledRepoId(FK)`, `sourceRepo`, `sourceFilePath`, `sourceLineStart`, `sourceLineEnd`, `sourceCommitSha`, `sourceUrl`, `license`, `functionName`, `codeBlock(text)`, `charCount`, `lineCount`, `astHash`, `disabled(bool)`, `createdAt` | 問題本体。`codeBlock` は **コメント除去後**。`sourceLineStart` / `sourceLineEnd` は **コメント除去前の元ファイル基準**（1-indexed） |
| `crawler_runs` | `id`, `languageId`, `targetOwner`, `targetRepo`, `status(running/success/failed/skipped)`, `problemsAdded`, `startedAt`, `finishedAt`, `errorMessage` | 1 repo 1 行のバッチ実行履歴。同日 `running` レコードがあれば二重起動を防止 |

関連：[`../score-ranking/README.md`](../score-ranking/README.md) の ER 図参照。

## フロー図

### クロール（週次 cron、言語別に独立）

```mermaid
flowchart TD
    Cron[週次 cron<br/>毎週月曜 03:00 JST<br/>言語別に独立] --> Check{同日 running なし?}
    Check -->|あり| Skip0[二重起動防止で終了]
    Check -->|なし| Loop[CRAWLER_REPOS_PER_RUN 回ループ<br/>デフォルト 1]
    Loop --> Search[GitHub Search API<br/>language + license + stars>1000 + pushed>6ヶ月]
    Search --> Pick[crawled_repos に未登録の<br/>最上位 repo を 1 つ選定]
    Pick --> None{候補あり?}
    None -->|なし| End[終了]
    None -->|あり| RunStart[(crawler_runs に running を記録)]
    RunStart --> Meta[GET /repos/owner/name で<br/>description / homepage / topics 取得]
    Meta --> Files[ts ファイル取得<br/>tree API + raw 取得]
    Files --> AST[TypeScript Compiler API で AST 構築]
    AST --> Extract[関数ノード抽出<br/>FunctionDecl / ArrowFn / Method]
    Extract --> Lines[行範囲取得<br/>getLineAndCharacterOfPosition]
    Lines --> StripComment[コメント除去<br/>forEachLeading/TrailingCommentRange]
    StripComment --> Filter[採用条件チェック<br/>文字数 / 非ASCII / 行長 / 名前あり]
    Filter --> Dedup[AST ハッシュで重複排除]
    Dedup --> Count{採用候補 ≥ 30?}
    Count -->|No| EligNg[(crawled_repos に eligible=false で保存<br/>problems には何も書かない)]
    Count -->|Yes| Sample[ランダムサンプリングで最大 100 個選定]
    Sample --> Save[(problems テーブルに保存<br/>crawled_repos に eligible=true で保存)]
    EligNg --> RunEnd[(crawler_runs を success/skipped で更新)]
    Save --> RunEnd
    RunEnd --> Loop

    Loop -.->|エラー| Fail[(crawler_runs を failed で更新<br/>crawled_repos に disabled=true)]
    Fail --> Loop
```

### 出題（セッション開始時）

```mermaid
flowchart TD
    Solo[POST /api/play-sessions/solo] --> Pick[eligible repo から<br/>1 つランダム抽選]
    Pick --> Pool[(その repo の problems から<br/>20 問 random 抽出)]
    Pool --> Fallback{20 問取れた?}
    Fallback -->|Yes| Out[Problem 20 問 + repoInfo を返却]
    Fallback -->|No| Fill[他 eligible repo から補填<br/>repoInfo.fallback=true]
    Fill --> Out

    Gods[POST /api/play-sessions/challenge-gods] --> Inherit[神 session の repo を継承]
    Inherit --> Out
```

## 注意事項

- **ローンチ初期のプール薄さ**：1 repo / 週ペースでは 10 repo に達するまで約 10 週間。ローンチ前に **`CRAWLER_REPOS_PER_RUN=5` のようなブートストラップ設定** で 50 repo まで一気に積み上げてから通常運用に切り替える想定。
- **AST 解析の処理コスト**：1 ファイルあたり数十 ms、1 repo の全ファイル走査でも数秒〜数十秒。1 cron 実行内で十分完結する。
- **型未解決の表示**：MVP では型同梱を行わないため、関数シグネチャに登場する `User` のようなプロジェクト独自型はそのまま問題テキストに現れる。コード片の打鍵が目的のため体験上は問題ない。
- **JSX / TSX**：MVP では `.ts` / `.js` のみを対象とし、`.tsx` / `.jsx` は対象外でスタート。
- **コメント除去で関数が短くなりすぎるケース**：JSDoc が長く本体が短い関数は、除去後に 80 文字未満になることがある。これは採用条件で自然に弾かれる。
- **行範囲のズレ**：プレイ画面に表示するコードは「コメント除去後」、`sourceUrl` で GitHub に飛ぶと「除去前」の元ファイルが見える。この **差異がユーザーを混乱させないよう、リプレイ画面に「GitHub で原文を見る（コメント付き）」と注釈** する。
- **不適切コード**：人名・連絡先・URL を含む文字列リテラルなどが含まれている可能性。MVP では完全自動チェックは難しいため、運営の事後対応（CLI 経由で `disabled` 化）で吸収。NG ワード辞書による事前フィルタは将来検討。
- **クローラ PAT 管理**：運営アカウントの PAT は **環境変数経由で注入**、コードベース・ログには絶対に出さない。月次でローテーション。
- **言語別 cron の独立**：本ドキュメントは TypeScript 用 cron を例示。JavaScript / Go 等は同型の cron を別実装するが、AST 抽出層は言語固有のため別途設計（本仕様の対象外）。
- **問題数の目標**：MVP リリース時に各言語 200 問題以上をプールに格納できることを目標。ブートストラップで 5〜10 repo 積めば余裕で到達。
