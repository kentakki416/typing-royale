# step1: DB スキーマ追加（play_sessions / play_session_problems / keystroke_logs / user_lifetime_stats）

`packages/db/prisma/schema.prisma` に typing-engine 関連の 4 テーブルを追加し、マイグレーションを 1 回で適用する。Phase 3 の `/finish` で全テーブルに書き込むが、Phase 4 でランキング集計とエンジニアグレード判定に使うカラム（`bestScoreByLanguage`、`currentGrade`、`currentGradeReachedAt`、`streakDays`、`lastPlayedDate`）も同じ migration で先に作る（Phase 4 で migration を増やさず、`/finish` 側でだけ書き込みを段階的に追加する方が運用が単純）。

## 設計方針

- **`mode`** は **`String`** にする（`"solo"` / `"challenge_gods"`）。enum にすると Phase 5 で新モード追加時に migration が必要になるため、apps/cron の `runType` と同じ流派で文字列固定値を使う
- **`onDelete`** はテーブルごとに使い分け：
  - `userId` → CASCADE（user 削除でプレイ履歴も全削除。GDPR 的にも望ましい）
  - `languageId` → RESTRICT（言語マスタは消さない）
  - `crawledRepoId` → RESTRICT（repo を `disabled=true` に倒しても過去履歴は残す）
  - `ghostSessionId` → SetNull（神セッション消失でも履歴は残す）
  - `playSessionId`（子テーブル全て）→ CASCADE
- **`accuracy`** は `Float`（PostgreSQL `double precision`）。0.0〜1.0 の範囲で計算用、整数丸めは行わない
- **`totalTypedChars`** は `BigInt`。1500 文字/session × 100 session/日 × 365 日 × 10 年 ≒ 5.5 億で int 上限近づくため安全側
- **`compressedLog`** は `bytea`。keystroke log を gzip 圧縮（Phase 3 step2 で実装）
- **複合インデックス** はマイページ履歴・ランキング集計・シーケンス取得の 3 ユースケースに合わせて最小限

## 対応内容

### `packages/db/prisma/schema.prisma` への追加

既存の問題プール関連テーブル（`CrawlerRunItem` 等）の末尾に以下を追加。命名は `camelCase` (Prisma) ⇔ `snake_case` (DB) の対応を `@map` で取る。

```prisma
// プレイ結果の1セッション
model PlaySession {
  id                Int       @id @default(autoincrement())
  userId            Int       @map("user_id") /// 認証済みのみ。ゲストは DB 保存しない方針なので NOT NULL
  languageId        Int       @map("language_id")
  mode              String    /// "solo" / "challenge_gods"（Phase 3 では "solo" のみ）
  ghostSessionId    Int?      @map("ghost_session_id") /// challenge_gods モード時に神のセッション ID を保持。神セッション削除時は SetNull
  crawledRepoId     Int       @map("crawled_repo_id") /// このセッションのメイン repo（神々モードは神が打った repo を継承）
  repoFallback      Boolean   @default(false) @map("repo_fallback") /// 20 問が単一 repo で揃わず他 repo から補填された場合 true
  typedChars        Int       @map("typed_chars") /// 120 秒間で正しく入力できた累計文字数
  accuracy          Float     /// 正解打鍵数 / 総打鍵数（0.0〜1.0）
  score             Int       /// typedChars × accuracy をサーバーで計算した値
  problemsPlayed    Int       @map("problems_played") /// セッション中に出題された問題数
  problemsCompleted Int       @map("problems_completed") /// 完走した問題数
  mistypeStats      Json      @map("mistype_stats") /// 文字別誤打鍵カウント。例: { "a": 3, ";": 5, "{": 2 }
  playedAt          DateTime  @map("played_at") /// /finish のサーバー時刻。ランキング集計の期間判定にも使う
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  user            User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  language        Language            @relation(fields: [languageId], references: [id], onDelete: Restrict)
  crawledRepo     CrawledRepo         @relation(fields: [crawledRepoId], references: [id], onDelete: Restrict)
  ghostSession    PlaySession?        @relation("GhostReference", fields: [ghostSessionId], references: [id], onDelete: SetNull)
  ghostedBy       PlaySession[]       @relation("GhostReference")
  problems        PlaySessionProblem[]
  keystrokeLog    KeystrokeLog?

  @@index([userId, playedAt(sort: Desc)]) /// マイページの履歴表示用
  @@index([languageId, score(sort: Desc)]) /// Phase 4 のランキング集計（言語別 × スコア降順）
  @@index([languageId, playedAt(sort: Desc)]) /// Phase 4 の期間別集計（日/週/月）
  @@map("play_sessions")
}

// セッション中に出題された問題のシーケンス（0..19）
model PlaySessionProblem {
  id            Int      @id @default(autoincrement())
  playSessionId Int      @map("play_session_id")
  problemId     Int      @map("problem_id")
  orderIndex    Int      @map("order_index") /// 0 から始まる出題順
  charsTyped    Int      @map("chars_typed") /// 完走しなくても部分入力分を保存（120秒切れ時に途中だった問題用）
  completed     Boolean  /// 関数を最終文字まで完走したか
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  playSession PlaySession @relation(fields: [playSessionId], references: [id], onDelete: Cascade)
  problem     Problem     @relation(fields: [problemId], references: [id], onDelete: Restrict)

  @@unique([playSessionId, orderIndex]) /// シーケンス内の順序ユニーク
  @@index([playSessionId, orderIndex])
  @@map("play_session_problems")
}

// キーストロークログ（ゴースト併走・リプレイ閲覧で利用）
model KeystrokeLog {
  playSessionId  Int      @id @map("play_session_id") /// PlaySession と 1:1
  compressedLog  Bytes    @map("compressed_log") /// gzip 圧縮された JSON 配列。形式は ghost-battle/README.md 参照
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  playSession PlaySession @relation(fields: [playSessionId], references: [id], onDelete: Cascade)

  @@map("keystroke_logs")
}

// ユーザー生涯統計（特典・グレード判定・マイページの累計表示に利用）
model UserLifetimeStats {
  userId                 Int       @id @map("user_id")
  totalTypedChars        BigInt    @default(0) @map("total_typed_chars") /// 全プレイ通算の正解打鍵数
  totalSessions          Int       @default(0) @map("total_sessions")
  bestScore              Int       @default(0) @map("best_score") /// 全言語通算のベストスコア（グレード判定の基準）
  bestScoreByLanguage    Json      @default("{}") @map("best_score_by_language") /// 例: { "typescript": 543, "javascript": 213 }
  currentGrade           String?   @map("current_grade") /// エンジニアグレード slug（"intern" / "junior" / ...）。Phase 4 で更新開始
  currentGradeReachedAt  DateTime? @map("current_grade_reached_at") /// グレードに到達した時刻
  lifetimeMistypeStats   Json      @default("{}") @map("lifetime_mistype_stats") /// 文字別の生涯累計誤打鍵
  streakDays             Int       @default(0) @map("streak_days") /// 連続プレイ日数
  lastPlayedDate         DateTime? @db.Date @map("last_played_date") /// 連続日数判定用（タイムゾーンは JST 想定）
  createdAt              DateTime  @default(now()) @map("created_at")
  updatedAt              DateTime  @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_lifetime_stats")
}
```

### `User` モデルへのリレーション逆参照追加

既存の `User` に以下のリレーションを足す。FK 側で `onDelete: Cascade` を指定済みなので追加制約は不要。

```prisma
model User {
  // ... 既存フィールド ...

  playSessions      PlaySession[]
  lifetimeStats     UserLifetimeStats?
}
```

### `Language` / `CrawledRepo` / `Problem` モデルへのリレーション逆参照追加

```prisma
model Language {
  // ...
  playSessions PlaySession[]
}

model CrawledRepo {
  // ...
  playSessions PlaySession[]
}

model Problem {
  // ...
  playSessionProblems PlaySessionProblem[]
}
```

### Prisma マイグレーション

```bash
cd apps/api && pnpm db:migrate
```

マイグレーション名は `typing_engine_initial`（タイムスタンプ自動付与）。

### `packages/db` の barrel に追加生成型を export

`pnpm db:generate` で生成された `PlaySession` / `PlaySessionProblem` / `KeystrokeLog` / `UserLifetimeStats` 型は `@prisma/client` 経由で利用可能。新たな export 操作は不要（既存パターンと同じ）。

## 動作確認

### マイグレーションが適用されること

```bash
cd apps/api && pnpm db:migrate
```

`Already in sync` ではなく `Applying migration 'YYYYMMDDHHMMSS_typing_engine_initial'` が出ること。

### テーブルが作成されたこと

```bash
docker exec typing-royale-postgres psql -U postgres -d project-template_dev -c "\dt"
```

`play_sessions` / `play_session_problems` / `keystroke_logs` / `user_lifetime_stats` の 4 つが追加されていることを確認。

### スキーマと FK 制約が正しいこと

```bash
docker exec typing-royale-postgres psql -U postgres -d project-template_dev -c "\d play_sessions"
docker exec typing-royale-postgres psql -U postgres -d project-template_dev -c "\d play_session_problems"
docker exec typing-royale-postgres psql -U postgres -d project-template_dev -c "\d keystroke_logs"
docker exec typing-royale-postgres psql -U postgres -d project-template_dev -c "\d user_lifetime_stats"
```

特に確認するもの：

- `play_sessions`: 3 つの index が作られている（`(user_id, played_at DESC)`、`(language_id, score DESC)`、`(language_id, played_at DESC)`）
- `play_sessions.user_id` → `users(id)` ON DELETE CASCADE
- `play_sessions.crawled_repo_id` → `crawled_repos(id)` ON DELETE RESTRICT
- `play_sessions.ghost_session_id` → `play_sessions(id)` ON DELETE SET NULL（self-reference）
- `play_session_problems` の `(play_session_id, order_index)` UNIQUE
- `keystroke_logs.compressed_log` が `bytea` 型
- `user_lifetime_stats.total_typed_chars` が `bigint` 型
- `user_lifetime_stats.best_score_by_language` / `lifetime_mistype_stats` が `jsonb` 型かつ `default '{}'`

### Prisma Client から型が引けること

```bash
cd packages/db && pnpm db:generate
```

`apps/api` から以下が import 可能になる：

```typescript
import type { PlaySession, PlaySessionProblem, KeystrokeLog, UserLifetimeStats } from "@repo/db"
```

### Lint / Build

```bash
pnpm lint
pnpm build
```

すべて緑。

## 次の step での利用

- step2 で各テーブルに対応する Repository（`PrismaPlaySessionRepository` / `PrismaPlaySessionProblemRepository` / `PrismaKeystrokeLogRepository` / `PrismaUserLifetimeStatsRepository`）を `apps/api/src/repository/prisma/` に追加する
- step2 で `POST /api/play-sessions/solo` / `POST /api/play-sessions/:id/finish` の Controller / Service を実装し、上記 4 テーブルへの書き込みを行う
- step3 / step4 ではこの DB スキーマは直接触らず、step2 の API 経由で読み書きする
