# step4: リザルト画面の UX 改善 + ホーム見逃し popup

step3 までで `/finish` は数十〜数百 ms で返るようになるので、apps/web のフローを「即時遷移 → 集計中表示 → 結果到着で音 + 表示 → 1.6 秒後ポップアップ」に再構成する。さらに、worker 完了済みだがユーザーが popup を見ていない reward を、次回ホーム画面アクセス時に **1 度だけ** 表示する。

## 対応内容

### リザルト画面のフロー再構成

#### `apps/web/src/app/play/[sessionId]/play-loop.tsx`

**Before** (タイマー 0 → /finish await → phase=result):

```typescript
const handleTimeout = async () => {
  playFinish()
  const result = await fetch("/api/internal/finish", { ... })
  setResult(result)
  setPhase("result")
}
```

**After** (タイマー 0 で **即遷移** → /finish はバックグラウンド):

```typescript
const handleTimeout = () => {
  setResult(null)         /** loading 状態として明示 */
  setPhase("result")
  /** /finish は非同期で投げる、レスポンス受信で setResult + playFinish */
  void runFinishInBackground()
}

const runFinishInBackground = async () => {
  try {
    const result = await fetch("/api/internal/finish", { ... }).then(/* parse */)
    setResult(result)
    playFinish()  /** 完了 SE を結果到着時に再生 */
  } catch {
    setResult({ /* fallback: 通信失敗フラグ付き */ })
  }
}
```

`use-countdown.ts` 側で「タイマー 0 になった瞬間」に SE を鳴らしていたら、その箇所を削除（`handleTimeout` 内で playFinish するのと二重発火するため）。

#### `apps/web/src/app/play/[sessionId]/result-screen.tsx`

`result === null` のときは「集計中…」placeholder を出す:

```tsx
export function ResultScreen({ result, ... }: Props) {
  if (result === null) {
    return <ResultScreenLoading />
  }
  /** 既存の result 表示 */
  return ( ... )
}

function ResultScreenLoading() {
  return (
    <div className="container">
      <div className="card text-center" style={{ padding: "48px 16px" }}>
        <div className="spinner" />
        <div className="text-mono text-muted mt-16">集計中…</div>
        <p className="text-sm text-muted mt-8">スコアと順位を集計しています</p>
      </div>
    </div>
  )
}
```

- フリーズに見える時間は **/finish のレスポンスが返るまで** に限定される（数十〜数百 ms）が、その間も loading UI が出るので「動いている」感は明確
- スピナーは既存の CSS class があれば再利用、無ければ inline SVG で OK

#### `apps/web/src/app/play/[sessionId]/result-screen.tsx` の fire-and-forget 削除

step3 で `/api/rewards/generate` が消えているので、result-screen の以下 useEffect を **削除**:

```typescript
// 削除対象
useEffect(() => {
  if (result === null || !result.persisted) return
  const pending = result.pending_rewards
  if (pending.length === 0) return
  sessionStorage.setItem("pendingRewards", JSON.stringify({ items: pending, startedAt: Date.now() }))
  for (const p of pending) {
    void fetch("/api/internal/rewards/generate", { ... })  // 削除: クライアントは何も叩かない
  }
}, [result])
```

代わりに **sessionStorage への保存だけは残す**（既存 `PendingRewardsPopup` が polling で使うため）:

```typescript
useEffect(() => {
  if (result === null || !result.persisted) return
  const pending = result.pending_rewards
  if (pending.length === 0) return
  sessionStorage.setItem(
    "pendingRewards",
    JSON.stringify({ items: pending, startedAt: Date.now() }),
  )
  /** generate 呼び出しは削除: worker が処理する */
}, [result])
```

### ホーム見逃し popup

新しい Client Component を追加。`PendingRewardsPopup`（既存 sessionStorage polling）と共存。

#### 設計の整理

| Component | 起動タイミング | データソース | 1 回だけの判定 |
|---|---|---|---|
| `PendingRewardsPopup` (既存) | ホーム mount 時 | sessionStorage (`pendingRewards`) | sessionStorage を clear |
| `MissedRewardsPopup` (新規) | ホーム mount 時 | `GET /api/internal/rewards/me` の中で `granted_at` 直近 7 日 + `generation_status="completed"` | localStorage (`seen-reward-ids`) に id を追加 |

両方とも同じ `RewardPreviewModal` の見た目を使う。違いは「いつ来るか」「どう判定するか」だけ。

#### `apps/web/src/components/missed-rewards-popup.tsx` (新規)

```typescript
"use client"

import { useEffect, useState } from "react"

import type { GetMyRewardsResponse } from "@repo/api-schema"

const STORAGE_KEY = "seen-reward-ids"
/** 7 日以上前の reward は対象外 */
const RECENT_DAYS = 7

type Reward = GetMyRewardsResponse["rewards"][number]

/**
 * ホーム画面アクセス時に「worker が完了済 / ユーザーが未確認」の reward があれば
 * 1 回だけ popup 表示する。詳細: docs/spec/rewards-worker/step4-web-ux-and-missed-popup.md
 *
 * `PendingRewardsPopup` (sessionStorage 起点) と共存する。
 * - `PendingRewardsPopup` がリザルト直後の popup を担当
 * - 本コンポーネントが「タブ閉じ→再訪」「リザルト画面を即離脱」等の取りこぼしを担当
 */
export function MissedRewardsPopup() {
  const [target, setTarget] = useState<Reward | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/internal/rewards/me")
        if (!res.ok) return
        const data = await res.json() as GetMyRewardsResponse

        const seenIds = readSeenIds()
        const sinceMs = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000

        /** completed + 直近 + 未表示 */
        const candidate = data.rewards.find((r) =>
          r.generation_status === "completed"
          && r.asset_url !== null
          && Date.parse(r.granted_at) >= sinceMs
          && !seenIds.has(r.reward_id),
        )

        if (candidate !== undefined) {
          setTarget(candidate)
        }
      } catch {
        /** 補助動線のためサイレントに無視 */
      }
    })()
  }, [])

  if (target === null) return null

  return (
    <RewardPreviewModal
      reward={target}
      onClose={() => {
        markSeen(target.reward_id)
        setTarget(null)
      }}
    />
  )
}

const readSeenIds = (): Set<number> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((n): n is number => typeof n === "number"))
  } catch {
    return new Set()
  }
}

const markSeen = (rewardId: number): void => {
  const ids = readSeenIds()
  ids.add(rewardId)
  /** 直近の 100 件だけ保持して localStorage を膨張させない */
  const list = Array.from(ids).slice(-100)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}
```

「1 度だけ表示」のロジック:
- 表示する直前に target を state に積む
- `onClose` で `markSeen()` → localStorage に id 追加 → 次回 mount 時の filter で除外される

#### `apps/web/src/app/page.tsx` への組み込み

```tsx
import { MissedRewardsPopup } from "@/components/missed-rewards-popup"
import { PendingRewardsPopup } from "@/components/pending-rewards-popup"

export default async function HomePage() {
  return (
    <>
      ...既存...
      <PendingRewardsPopup />
      <MissedRewardsPopup />  {/* 新規 */}
    </>
  )
}
```

両方とも mount 時に並行で動く。

- リザルト直後（sessionStorage に新しい pending あり）→ `PendingRewardsPopup` が出す
- タブ閉じてからの再訪（sessionStorage はクリアだが reward は完成済）→ `MissedRewardsPopup` が出す

両方が同時に target を持ったケースは現実的には稀（最新の reward は `PendingRewardsPopup` の sessionStorage に乗っているはずなので）。同時表示にはなるが互いの dialog が重なるだけで動作はする。

#### RewardPreviewModal の共通化

既存の `PendingRewardsPopup` 内で reward を表示している部分を `apps/web/src/components/reward-preview-modal.tsx` として切り出し、`MissedRewardsPopup` からも import する:

```typescript
type Props = {
    onClose: () => void
    reward: Reward
}

export function RewardPreviewModal({ onClose, reward }: Props) {
  /** 既存 PendingRewardsPopup のモーダル部分をそのまま */
}
```

### PendingRewardsPopup の修正

step3 で `generation_status` がレスポンスに含まれるようになるので、polling の完了判定を以下に変更:

```typescript
// before
const allReady = parsed.items.every((p) => data.rewards.some(
  (r) => r.reward_id === p.reward_id && r.asset_url !== null && r.asset_svg_url !== null,
))

// after
const allReady = parsed.items.every((p) => data.rewards.some(
  (r) => r.reward_id === p.reward_id
        && r.generation_status === "completed",
))
```

`generation_status === "failed"` のものは polling 対象から外し、popup には出さない。

## 動作確認

### 手動 (local dev)

1. apps/api / apps/worker / apps/web を起動
2. dev-login alice → プレイ → 結果到着
3. リザルト画面到達: タイマー 0 で **即時** 画面遷移、「集計中…」表示、200ms 程度後に結果表示 + 完了 SE
4. TOP 10 入賞時: 1.6 秒後にゆっくり popup
5. ホームに戻る → `PendingRewardsPopup` が polling で worker 完了をキャッチ → popup 表示
6. popup 閉じる → sessionStorage クリア

### 見逃し popup の手動確認

1. プレイ → リザルト到達後、すぐにブラウザのタブを閉じる（worker 処理中で sessionStorage の popup を見ない）
2. 数秒待つ（worker が完了するのを待つ）
3. 新しいタブでホームを開く
4. `MissedRewardsPopup` が起動 → reward を popup 表示
5. 閉じる → localStorage に id 追加されたので、再度ホームを開いても表示されない

### Playwright E2E

```typescript
test("missed reward popup on home shows after tab close and rejoin", async ({ page }) => {
  // 1. プレイ → TOP 10 入賞
  // 2. result-screen まで到達したらタブクローズ
  // 3. 数秒待機 (worker 完了)
  // 4. 再度 / にアクセス
  // 5. MissedRewardsPopup が表示されることを assert
  // 6. 閉じてもう一度 / にアクセスしても出ないことを assert
})
```

### スクリーンショット

`docs/screenshots/rewards-worker/` に before / after を保存:
- リザルト画面: before (空白フリーズ) / after (集計中… → 結果)
- ホーム: 見逃し popup 表示状態
