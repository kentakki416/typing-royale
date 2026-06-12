# step2: Web — sessionStorage 経由の claim フロー

Web 側で claim フローを完結させるステップ。step1 で API 側が `/guest/finish` のレスポンスに `claim_ticket` を返し、`/api/play-sessions/claim` が用意されている前提。

クライアント側で以下を行う：

1. ゲスト完走時に `claim_ticket` を sessionStorage に保存
2. ログイン後の画面で sessionStorage を監視する `GuestClaimWatcher` を起動
3. ticket を検知したら Server Action 経由で `/api/play-sessions/claim` を叩く
4. 成功時はリザルト画面相当の表示に再描画、失敗時はトーストでユーザーに通知

## 対応内容

### Server Action（`apps/web/src/libs/claim-guest-session.ts` 新規）

```ts
"use server"

import { ClaimGuestPlaySessionResponse } from "@repo/api-schema"

import { ApiClientError, apiClient } from "./api-client"

export type ClaimResult =
  | { kind: "expired" }       // 404: ticket が Redis から消えている
  | { kind: "ok"; value: ClaimGuestPlaySessionResponse }
  | { kind: "unauthorized" }  // 401: 認証期限切れ等
  | { kind: "unknown_error" }

/**
 * sessionStorage に保持された claim_ticket を使って Express の /api/play-sessions/claim を叩く。
 * ステータスに応じて kind を分けて返し、呼び出し側がトースト表示等を出し分けやすくする。
 */
export const claimGuestSessionAction = async (claimTicket: string): Promise<ClaimResult> => {
  try {
    const res = await apiClient.post<ClaimGuestPlaySessionResponse>(
      "/api/play-sessions/claim",
      { claim_ticket: claimTicket },
    )
    return { kind: "ok", value: res }
  } catch (err) {
    if (err instanceof ApiClientError) {
      if (err.status === 401) return { kind: "unauthorized" }
      if (err.status === 404) return { kind: "expired" }
    }
    return { kind: "unknown_error" }
  }
}
```

### sessionStorage キー定数（`apps/web/src/libs/guest-claim.ts` 新規）

```ts
/**
 * /guest/finish 完走時にクライアントが claim_ticket を保存する sessionStorage キー
 *
 * ログイン後の GuestClaimWatcher が同キーを読み出して /claim を叩く。
 * 同一タブ内では OAuth 往復後も保持されるため、追加の State 機構は不要。
 */
export const PENDING_CLAIM_TICKET_KEY = "pendingClaimTicket"
```

### Client Component: `GuestClaimWatcher`（`apps/web/src/components/guest-claim-watcher.tsx` 新規）

```tsx
"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { claimGuestSessionAction } from "@/libs/claim-guest-session"
import { PENDING_CLAIM_TICKET_KEY } from "@/libs/guest-claim"

/**
 * sessionStorage に pendingClaimTicket が残っているかを監視し、
 * 残っていれば一度だけ claim を試みる Client Component。
 *
 * - 配置: layout 等の認証済みユーザーの初回到達画面
 * - 認証されていないユーザーが見ると 401 で kind: "unauthorized" が返るので、
 *   その場合は sessionStorage 削除をしないで「次回ログイン時に再試行」する
 * - 401 以外（成功 / 期限切れ / 想定外）は ticket を削除して再試行を止める
 */
export const GuestClaimWatcher = () => {
  const router = useRouter()

  useEffect(() => {
    const ticket = sessionStorage.getItem(PENDING_CLAIM_TICKET_KEY)
    if (ticket === null) return

    void (async () => {
      const result = await claimGuestSessionAction(ticket)
      switch (result.kind) {
        case "ok":
          sessionStorage.removeItem(PENDING_CLAIM_TICKET_KEY)
          /** claim 結果を別キーに渡して、リザルト相当の画面に遷移 */
          sessionStorage.setItem("claimedResult", JSON.stringify(result.value))
          router.push("/play/claimed")
          break
        case "expired":
          sessionStorage.removeItem(PENDING_CLAIM_TICKET_KEY)
          /** トースト表示は別途トーストライブラリ経由（既存があれば踏襲） */
          window.alert("直前のゲストプレイは保存期限切れでした")
          break
        case "unauthorized":
          /** 未ログイン中（普通の Top 画面アクセス等）は何もしない。次回ログイン時に再試行 */
          break
        case "unknown_error":
          sessionStorage.removeItem(PENDING_CLAIM_TICKET_KEY)
          break
      }
    })()
  }, [router])

  return null
}
```

### `apps/web/src/app/layout.tsx` に Watcher を常設

```tsx
import { GuestClaimWatcher } from "@/components/guest-claim-watcher"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {children}
        <GuestClaimWatcher />
      </body>
    </html>
  )
}
```

> 全画面で監視するか、トップ画面・サインイン後着地点だけに絞るかは UX 判断。MVP では layout に置いて常時監視で十分。

### PlayLoop で claim_ticket を sessionStorage に保存（`apps/web/src/app/play/[sessionId]/play-loop.tsx` の改修）

ゲストの `/finish` レスポンスを受け取った直後に sessionStorage に保存する：

```ts
if (isGuest) {
  const guestRes = await res.json() as FinishGuestPlaySessionResponse
  /** claim 用に ticket を保存。次のゲストプレイで上書きされる（後勝ち） */
  sessionStorage.setItem(PENDING_CLAIM_TICKET_KEY, guestRes.claim_ticket)
  result = {
    accuracy: guestRes.accuracy,
    /** ... 既存の normalize 処理 ... */
  }
}
```

### `/play/claimed` ページ（`apps/web/src/app/play/claimed/page.tsx` 新規）

claim 成功時に GuestClaimWatcher が遷移させる先。**リザルト画面と同じ UI を `persisted=true` 状態で表示** する：

```tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { ClaimGuestPlaySessionResponse } from "@repo/api-schema"

import { ResultScreen } from "../[sessionId]/result-screen"

export default function ClaimedResultPage() {
  const router = useRouter()
  const [result, setResult] = useState<ClaimGuestPlaySessionResponse | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem("claimedResult")
    if (raw === null) {
      /** 直接アクセスされた場合はトップへ */
      router.replace("/")
      return
    }
    setResult(JSON.parse(raw) as ClaimGuestPlaySessionResponse)
    sessionStorage.removeItem("claimedResult")
  }, [router])

  if (result === null) return null

  /** ResultScreen はゲスト判定を result.persisted=false で行うため、
   *  ここではログイン済み相当の result.persisted=true が渡って通常表示になる */
  return (
    <ResultScreen
      ghostSummary={null}
      ghostUserDisplay={null}
      mode="solo"
      problems={[]}                /* claim 後は問題詳細は要らない */
      repoInfo={{ /* placeholder or claim API レスポンスに含める */ }}
      result={result}
    />
  )
}
```

> リザルト画面の repo_info / problems が必要な場合は、claim API のレスポンスに同梱するか、別エンドポイントで取得する。MVP では「順位 / グレード等の集計値だけ表示」で問題なければ簡略化可能。

### proxy.ts への追加（不要）

`/play/claimed` は認証済みユーザーが見るページなので、新規 public 化は不要。**ただし** GuestClaimWatcher が `/` 等で動くのは想定済みで、すでに `/` は public 化されている（feat/guest-play で追加済み）。

## 動作確認

### Storybook / 単体表示確認（任意）

`GuestClaimWatcher` は単独で動かしづらいため、Storybook が無いプロジェクトでは手動確認に寄せる。

### 手動シナリオ確認

#### シナリオ 1: ゲストプレイ → ログイン → claim 成功 → 結果再描画

1. `pnpm dev` で web + api 起動
2. シークレットウィンドウで `/` にアクセス → 「▶ プレイ開始」
3. `/play` → 言語 + 通常プレイで完走（DB は test 用に seed 済み前提）
4. 結果画面で「💾 このスコアは保存されていません」+ CTA 表示を確認
5. DevTools > Application > Session Storage に `pendingClaimTicket` が保存されていること
6. CTA「GitHub で記録を残す」押下 → /sign-in → GitHub OAuth 完走
7. callback 後、Watcher が起動して /claim を叩き、`/play/claimed` へ遷移
8. リザルト画面が `persisted=true` 表示（順位・グレード等あり）になっていること
9. DB: `play_sessions` / `user_lifetime_stats` / `user_language_best` に行が増えていること
10. Redis: `claim:{ticket}` が削除されていること

#### シナリオ 2: ticket 期限切れ後にログイン

1. ゲストプレイ完走 → sessionStorage に ticket 保存
2. Redis 上で **手動で TTL 切れ**を演出（`redis-cli -n 0 DEL "claim:{ticket}"`、または開発時は TTL を短くして検証）
3. CTA 押下 → ログイン完了
4. Watcher が claim を試みて 404 → トースト or alert で「保存期限切れ」表示
5. sessionStorage から `pendingClaimTicket` が削除されていること
6. DB には書き込まれていないこと

#### シナリオ 3: 既ログイン状態でゲストプレイ起点ページに到達

そもそも `/play/guest/*` フローはログインユーザーには使われないが、念のため：

1. ログイン済み状態で `/` を開く
2. Watcher が起動するが、`pendingClaimTicket` が無いので何もしない（コンソールエラーなし）

#### シナリオ 4: ゲストプレイ 2 連戦 → ログイン

1. ゲストプレイ 1 回目完走 → ticket A 保存
2. すぐ別ゲストプレイ 2 回目完走 → sessionStorage で ticket B に**上書き**されること
3. ログイン → ticket B が claim され、ticket A は Redis 上で TTL 切れ
4. 2 回目のスコアが DB に保存され、1 回目は保存されないことを確認

### E2E（Playwright）

ゲスト → ログイン → claim までを 1 シナリオとして実装。OAuth 部分は mock token を流し込むテストヘルパー（`pnpm --filter api issue-test-token`）でショートカットして検証。

```ts
// apps/web/test/e2e/guest-claim.spec.ts
test("ゲスト完走 → ログインで claim され、リザルトが persisted で表示される", async ({ page }) => {
  await page.goto("/play")
  /** 言語選択 → プレイ → 完走 まで（既存 e2e の流れを再利用） */
  /** /play/[sessionId] の結果画面に到達 */
  await expect(page.getByText(/このスコアは保存されていません/)).toBeVisible()

  /** sessionStorage を確認 */
  const ticket = await page.evaluate(() => sessionStorage.getItem("pendingClaimTicket"))
  expect(ticket).toMatch(/^[0-9a-f-]{36}$/)

  /** test token を直接 cookie 注入してログイン状態を作る（OAuth を回さない） */
  await injectAuthCookies(page)

  /** layout の Watcher が起動して /claim を叩く → /play/claimed へ遷移するのを待つ */
  await page.goto("/")
  await page.waitForURL("/play/claimed")
  await expect(page.getByText(/順位/)).toBeVisible()
})
```

### ローカル DB / Redis の状態確認

```bash
# Redis に保存された ticket 一覧
redis-cli -n 0 KEYS "claim:*"

# 残り TTL
redis-cli -n 0 TTL "claim:{ticket}"

# 中身
redis-cli -n 0 GET "claim:{ticket}" | jq

# claim 成功後、DB の最新 play_session
psql $DATABASE_URL -c "SELECT id, user_id, score, played_at FROM play_sessions ORDER BY id DESC LIMIT 5;"
```
