---
name: design-step
description: 既に存在する feature spec（docs/spec/{feature}/README.md）に対して、AI 実装用の step ファイル（実装手順書）を 1 つ以上作成する skill。各 step は「対象 API / 画面」「リクエスト / レスポンス」「Mermaid 処理フロー」「番号付き処理サマリー」「設計方針」「対応内容（コード例）」「動作確認」を含む構造化テンプレートに従う。design-feature skill で feature README を作った後、または既存 feature に新しい step を追加するときに使う。ユーザーが「{feature} の step を作って」「次の step に進んで」「{feature} の API を設計書化して」と依頼したとき、または機能 README が完成してから実装に入る直前に呼び出す。複数 step がある場合は ユーザーに切り方を確認してから着手し、1 step = 1 PR を想定したサイズに保つ。design-feature skill（feature 全体の README + 初期 step）とは別物で、こちらは「step 単体の構造化」と「複数 step の連続作成」に特化している。
---

# design-step

既存の `docs/spec/{feature}/README.md` を元に、**実装に直結する step ファイル**（`step{N}-{layer}-{topic}.md`）を 1 〜複数本作成する skill。

design-feature skill は「機能の全体像（README + 初期 step）」を作るのが責務。本 skill は **「実装直前に AI が読んで手を動かせる粒度」までブレイクダウン** することに専念する。

## 目次

- [いつ使うか](#いつ使うか)
- [出力ファイル](#出力ファイル)
  - [ファイル命名規則](#ファイル命名規則)
- [step の切り方（最初に必ず確認）](#step-の切り方最初に必ず確認)
- [step ファイルの構造（厳格テンプレート）](#step-ファイルの構造厳格テンプレート)
  - [1. タイトル + リード文](#1-タイトル--リード文必須)
  - [2. 目次](#2-目次必須)
  - [3. 対象 API / 対象画面](#3-対象-api-api-step-の場合--対象画面web-step-の場合)
  - [4. 依存](#4-依存必要な場合のみ)
  - [5. リクエスト](#5-リクエストapi-step-のみ)
  - [6. レスポンス](#6-レスポンスapi-step-のみ)
  - [7. 処理フロー（Mermaid + 番号付きサマリー）](#7-処理フローmermaid--番号付きサマリー両方必須)
  - [8. その他のサマリー](#8-その他のサマリー必要に応じて)
  - [9. 設計方針](#9-設計方針必須)
  - [10. 対応内容](#10-対応内容必須)
  - [11. 動作確認](#11-動作確認必須)
  - [12. 次の step での利用](#12-次の-step-での利用必須)
- [進め方（フェーズ別）](#進め方フェーズ別)
  - [Phase 1: 切り方の合意](#phase-1-切り方の合意)
  - [Phase 2: 既存実装パターンの参照](#phase-2-既存実装パターンの参照)
  - [Phase 3: step ファイル作成](#phase-3-step-ファイル作成)
  - [Phase 4: ユーザーレビュー](#phase-4-ユーザーレビュー)
- [やってはいけないこと](#やってはいけないこと)

## いつ使うか

- feature の README が完成しているが、各 step がまだ未作成 / 古い形式の場合
- step1 が merged 済みで「次の step に進む」と依頼されたとき
- 既存 step の構造化（フロー図 / リクエスト / レスポンスのまとめ）を改善したいとき

## 出力ファイル

```
docs/spec/{feature}/
├── README.md            ← design-feature skill が作る。本 skill は触らない
├── step1-db-{topic}.md
├── step2-api-{endpoint}.md
├── step3-web-{page}.md
└── ...
```

### ファイル命名規則

| パターン | 例 |
|---|---|
| DB schema 追加 | `step1-db-{topic}.md` |
| API エンドポイント実装 | `step{N}-api-{endpoint-name}.md`（例：`step2-api-solo-session.md`） |
| Web 画面 / フロー | `step{N}-web-{page-or-flow}.md` |
| Mobile 画面 | `step{N}-mobile-{screen}.md` |
| Admin 画面 | `step{N}-admin-{page}.md` |
| Cron / Worker | `step{N}-cron-{job-name}.md` |

- 番号は **小さい順に依存** （`step3` は `step1`〜`step2` の成果物を前提にしてよい）
- **1 step = 1 PR** を想定したサイズに保つ。1 step で複数エンドポイント / 複数画面を扱うと PR レビューが破綻する

## step の切り方（最初に必ず確認）

design-feature の README にある「必要な API」「必要な画面」を見て、step 分割案を出す。**ユーザーに `AskUserQuestion` で確認**してから着手する：

例：

- API が 4 本ある → 「1 API = 1 step」と「2 API まとめて 1 step」のどちらか
- Web 画面が 3 つある → 「言語選択 + プレイ画面」と「リザルト画面 + ゲストバッファ」のように凝集度で切る

切り方の指針：

| 切り方 | いつ採用 |
|---|---|
| **1 API = 1 step** | エンドポイント間で Repository / Service の共有が薄い、PR レビューを小さくしたい（推奨） |
| **複数 API を 1 step** | 同じ Repository を共有しテストも一括で書ける（例：CRUD 4 本） |
| **Repository 層だけで 1 step** | Repository 共通基盤が広範囲に影響する場合のみ |
| **Web 画面を凝集度で 1 step** | ユーザー体験が連続している（言語選択 → スプラッシュ → プレイ画面は 1 step） |

## step ファイルの構造（厳格テンプレート）

各 step は以下のセクションを **この順番** で含める。

### 1. タイトル + リード文（必須）

```markdown
# step{N}: {何をするか一文で}

（2〜3 段落でこの step の責務と前後の step との関係を述べる。step1 では何が用意済みで、本 step では何を追加し、次の step に何を渡すかを明示する）
```

### 2. 目次（必須）

リード文の直後に置く。**GitHub Markdown のアンカーリンク形式** で、`##` / `###` の見出しをすべて含める：

```markdown
## 目次

- [対象 API](#対象-api)
- [リクエスト](#リクエスト)
  - [Body](#body)
- [レスポンス](#レスポンス)
  - [200 OK](#200-ok)
  - [エラー](#エラー)
- [処理フロー](#処理フロー)
  - [処理の流れ](#処理の流れ)
- [設計方針](#設計方針)
- [対応内容](#対応内容)
- [動作確認](#動作確認)
- [次の step での利用](#次の-step-での利用)
```

アンカー変換ルール（GitHub flavored）：

- 大文字 → 小文字（英字のみ）
- スペース → ハイフン
- バッククォート ` ` ` / 句読点 / 括弧 `（）「」()` / コロン `：:` / スラッシュ `/` / 中黒 `・` → **削除**
- 日本語はそのまま残す
- 数字とハイフンは残す

例：

| 見出し | アンカー |
|---|---|
| `## 対象 API` | `#対象-api` |
| `## Redis ステート` | `#redis-ステート` |
| `## 次の step での利用` | `#次の-step-での利用` |
| `## 依存（重要）` | `#依存重要` |
| `## 対象画面・呼び出し API` | `#対象画面呼び出し-api` |
| `## 120 秒タイマー（rAF ループ）` | `#120-秒タイマーraf-ループ` |
| `## /finish 呼び出し時のデータフロー` | `#finish-呼び出し時のデータフロー` |
| `### 200 OK` | `#200-ok` |
| `### IndexedDB スキーマ` | `#indexeddb-スキーマ` |

**含めるレベル**：`##`（必須）+ `###`（重要なものだけ：`### 処理の流れ` / `### 200 OK` / `### エラー` / `### Body` 等）。`### apps/api/...` のようなファイルパス見出しは **含めない**（粒度が細かすぎて目次が肥大化する）。

### 3. 対象 API（API step の場合）/ 対象画面（Web step の場合）

API step：

```markdown
## 対象 API

| 項目 | 値 |
|---|---|
| メソッド / パス | `POST /api/...` |
| 認証 | 必須（Bearer JWT） / 不要 / ... |
| 副作用 | DB 書き込み / Redis 操作 / 外部 API 呼び出し |
| 冪等性 | 冪等 / 非冪等（理由を 1 行で） |
| 呼び出し元 | apps/web の {画面名}（stepX） |
| 連携 step | 本 step の成果物を {step} が読み出して使う |
```

Web step：

```markdown
## 対象画面・呼び出し API

### 画面（Next.js Route）

| Route | コンポーネント | 概要 |
|---|---|---|
| `/path` | Server + Client | （役割） |

### 呼び出す API

| メソッド / パス | 呼び出すタイミング | 経路 | 認証 |
|---|---|---|---|
| `POST /api/...` | （何のとき） | Server Action / Route Handler / Client→Express | 必須 / 不要 |
```

### 4. 依存（必要な場合のみ）

別 feature や未完成機能に依存する場合は、依存先と stub の有無を明示：

```markdown
## 依存

| 依存先 | 何を使うか | 本 step での扱い |
|---|---|---|
| {他 feature の機能名} | テーブル / API / 関数 | 必須前提 / Stub で進めて後で差し替え |
```

### 5. リクエスト（API step のみ）

```markdown
## リクエスト

### Path Param（必要な場合）

| パラメータ | 型 | 制約 | 説明 |

### Body

\`\`\`json
{ "field": "value" }
\`\`\`

| フィールド | 型 | 必須 | 制約 | 説明 |
|---|---|---|---|---|
```

### 6. レスポンス（API step のみ）

```markdown
## レスポンス

### 200 OK

\`\`\`json
{ ... }
\`\`\`

| フィールド | 型 | 説明 |

### エラー

| Status | type | 条件 | クライアント挙動 |
|---|---|---|---|
| 400 | BAD_REQUEST | ... | ... |
| 401 | UNAUTHORIZED | ... | ... |
| 404 | NOT_FOUND | ... | ... |
```

`type` は `apps/api/CLAUDE.md` の `ApiError.type`（`BAD_REQUEST | CONFLICT | FORBIDDEN | NOT_FOUND | UNAUTHORIZED`）を使う。

### 7. 処理フロー（Mermaid + 番号付きサマリー、両方必須）

**フロー図と番号付きサマリーは必ず両方を載せる**。フロー図は構造を、番号付きサマリーは順序を、それぞれ分担して説明する。

```markdown
## 処理フロー

\`\`\`mermaid
sequenceDiagram
    participant C as Client
    participant Ctrl as Controller
    participant Svc as Service
    participant DB as Postgres
    participant R as Redis

    C->>Ctrl: POST /api/...
    Ctrl->>Svc: ...
    Svc->>DB: ...
    Svc-->>Ctrl: ok(...)
    Ctrl-->>C: 200
\`\`\`

### 処理の流れ

1. リクエスト Body を Zod スキーマで検証
2. ユーザー / 入力値の存在チェック（NG なら 400）
3. メイン処理（例：repo 抽選 / 集計 / 書き込み）
4. Redis に state を保存（または削除）
5. レスポンスを返却
```

#### 番号付きサマリーの書き方

- **5〜12 ステップ程度** にまとめる（多すぎると Mermaid と重複、少なすぎると要約しすぎ）
- 各ステップは **動詞** で始める（「〜を検証」「〜を取得」「〜を保存」）
- **エラー分岐も載せる**（「NG なら 400」「無ければ 404」を末尾に括弧書き）
- 内部実装の関数名・テーブル名を **具体的に書く** （「`PrismaPlaySessionRepository.create` で書き込み」「`ranking_snapshots` から取得」）
- Mermaid と同じ順序にする（読者が対応関係を取れるように）

Web step では sequence diagram 以外に flowchart / stateDiagram を使うことが多い。複数のフロー図を載せる場合は **「画面遷移フロー」など最も全体像を表すフロー図の直下** に番号付きサマリーを置く。

### 8. その他のサマリー（必要に応じて）

API step なら：
- **Redis ステート**（key / TTL / value の JSON サンプル）
- **サーバー集計ロジック**（純粋関数の入出力表）

Web step なら：
- **画面の状態モデル**（phase の遷移表）
- **mutable refs の表**（useRef で何を保持するか）
- **入力判定 / タイマーの内部フロー**（追加の Mermaid flowchart）

### 9. 設計方針（必須）

- 箇条書きで 5〜10 項目
- **Why を必ず書く**（「〜にする」だけでなく「〜の理由は」）
- 代替案を検討した上で選んだ場合は「代替案 X を採らない理由」も書く
- MVP スコープの境界を明示（「fallback は MVP では実装しない」等）

### 10. 対応内容（必須）

ファイル別に **追加するコード** を全て載せる。AI が読んで即座にコピペできる粒度にする：

```markdown
### `packages/schema/src/api-schema/{topic}.ts`（新規）

\`\`\`typescript
export const xxxRequestSchema = z.object({...})
\`\`\`

### `apps/api/src/repository/prisma/{topic}-repository.ts`（新規）

\`\`\`typescript
export interface XxxRepository { ... }
export class PrismaXxxRepository implements XxxRepository { ... }
\`\`\`

### `apps/api/src/service/{topic}-service.ts`（新規 or 追加）

\`\`\`typescript
export const xxx = async (input: Input, repo: { ... }): Promise<Result<T>> => { ... }
\`\`\`

（Controller / Router / index.ts の DI 追加もこの粒度で並べる）
```

**規約準拠**：

| 規約ソース | 守ること |
|---|---|
| `apps/api/CLAUDE.md` | Repository(interface+class) / Service(`export const`+`repo:{...}`) / Controller(class+execute) / Router(optional controllers) / Result 型 / try-catch を書かない |
| `apps/web/CLAUDE.md` | Server Component で fetch / Server Action は mutation / Route Handler は GET 取得や proxy / `apiClient` を経由 |
| `packages/schema/CLAUDE.md` | スキーマ命名規則（`{action}{Resource}{RequestPathParam|Request|Response}Schema`） |
| プロジェクト ESLint | セミコロン無し / ダブルクォート / sort-keys / id 先頭 / timestamps 末尾 |

### 11. 動作確認（必須）

| 区分 | 内容 |
|---|---|
| Service ユニットテスト | `apps/api/test/service/{topic}-service/{method}.test.ts`、`describe('正常系'/'異常系')` で分類、Repository を `vi.fn()` でモック |
| Controller インテグレーションテスト | `apps/api/test/controller/{topic}/{action}.test.ts`、実 Postgres + 実 Redis、`testPrisma` で最終状態確認、`toEqual` で API レスポンス検証 |
| Web | Playwright MCP で実画面確認（`verify-web-page` skill）、before/after スクショ |
| 手動 curl | dev-login で token 取得 → curl で叩く → DB / Redis を直接確認 |
| Lint / Build | `pnpm lint && pnpm build && pnpm test` がすべて緑 |

具体的なテストケースの抜粋（正常系 1〜2 / 異常系 4〜6）を **コード付き** で示す。

### 12. 次の step での利用（必須）

```markdown
## 次の step での利用

- **step{N+1}（{何をする}）**: 本 step の成果物を {どう使う}
- **step{N+2}（{何をする}）**: ...
- **{別 feature の step}**: 本 step の {コンポーネント} を {差し替え | 拡張}
```

後続 step との接続点を明示し、本 step で **意図的に省略したもの**（fallback / 認証拡張 / 既機能との結合）を全て列挙する。

## 進め方（フェーズ別）

### Phase 1: 切り方の合意

1. `docs/spec/{feature}/README.md` を読み込み、「必要な API」「必要な画面」「必要な DB」セクションを抽出
2. 既存の `step*.md` を一覧化（実装済み / 設計済み / 未着手）
3. 残作業を **AskUserQuestion** で確認する：
   - 切り方の候補を 2〜4 個提示（推奨案を先頭、`(Recommended)` ラベル付き）
   - 各候補に preview で「step ごとに何を作るか」のツリーを載せる
4. ユーザーが選んだ切り方で進める

### Phase 2: 既存実装パターンの参照

step に書くコードサンプルは **既存実装の流派と完全一致** させる。実装前に必ず以下を読む：

| 確認対象 | 参照先 |
|---|---|
| Repository (Prisma) | `apps/api/src/repository/prisma/memo-repository.ts` |
| Repository (Redis) | `apps/api/src/repository/redis/refresh-token-repository.ts` |
| Service（Result 型 / `repo: {...}`） | `apps/api/src/service/memo-service.ts` |
| Controller（class + execute） | `apps/api/src/controller/memo/list.ts` |
| Router（optional controllers） | `apps/api/src/routes/memo-router.ts` |
| DI 組み立て | `apps/api/src/index.ts` |
| Service unit テスト | `apps/api/test/service/memo-service/getMemoById.test.ts` |
| Controller integration テスト | `apps/api/test/controller/memo/list.test.ts` |
| api-schema | `packages/schema/src/api-schema/memo.ts` |
| Web Server Component / Server Action / Route Handler | `apps/web/src/app/onboarding/`, `apps/web/src/libs/api-client.ts` |

`apps/api/CLAUDE.md` / `apps/web/CLAUDE.md` / `packages/schema/CLAUDE.md` も再読する。

### Phase 3: step ファイル作成

合意した切り方の順に、各 step ファイルを **テンプレート 12 セクション** で作成する。

- 「目次」はリード文の直後（ファイル冒頭）に必ず置く
- 「処理フロー」では Mermaid + 番号付きサマリーを必ず両方書く
- 「対応内容」では追加するコードを **全て** 載せる（断片だけ書いて「同じパターン」と省略しない）
- 「動作確認」ではテストケースの分類（正常系 / 異常系）を明示

### Phase 4: ユーザーレビュー

各 step ごとにユーザーへ報告する：

- 作成ファイル名と行数
- 構造化セクション（特に対象 API / リクエスト / レスポンス / 処理フロー）の見せ方が伝わるか
- 「commit して PR にしますか / 続けて次の step を作りますか / 修正しますか」を選んでもらう

複数 step を「一気に作って」と依頼された場合は、Phase 1 で切り方を確定してから連続作成する。それでも **各 step は独立して完結する PR 単位** であることを崩さない。

## やってはいけないこと

- **README に書いてある内容を step に丸ごとコピー**する（step は実装手順、README は仕様。重複は不整合の元）
- **目次を省略する**（リード文の直後に必ず置く。`##` レベルの見出しは全て、重要な `###` も含める）
- **目次のアンカーリンクをテキストと不一致のまま放置**する（GitHub Markdown のアンカー変換ルールに従う：小文字化 / スペース→ハイフン / バッククォート・括弧・コロン・スラッシュ・中黒は削除）
- **Mermaid フロー図と番号付きサマリーのどちらか片方だけ**にする（両方で読み取り体験が完成する）
- **対応内容で「同様に〜」「以下省略」で実装を端折る**（AI が実装時に困る）
- **`apps/{api,web}/CLAUDE.md` の規約と矛盾するコード例**を載せる（`function` 宣言 / try-catch / 直接 fetch 等）
- **1 step に複数エンドポイント / 複数画面を詰め込む**（PR が肥大化、ロールバックも困難）
- **依存先機能が未実装なのに前提にする**（必ず「依存」セクションで stub 戦略を明示）
- **ユーザーに切り方を確認せず勝手に決める**
- **テストケースを「テストを書く」とだけ書いて具体例を出さない**（最低限の正常系 1 / 異常系 1 はコード付き）
- **`docs/spec/template/step1-template.md` の超簡素な書式に逆戻りする**（本 skill のテンプレートが正本）
