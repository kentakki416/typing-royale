# step5: ホーム画面ポップアップ（sessionStorage polling）

リザルト → ホーム遷移直後に、`/finish` で受け取った `pending_rewards` が生成完了しているかを polling し、完了したカードを popup で表示する。

## 対応内容

### sessionStorage への保存（リザルト画面側）

`apps/web/src/app/play/[sessionId]/result-screen.tsx` の `/finish` レスポンス受信箇所で:

```typescript
if (result.pending_rewards && result.pending_rewards.length > 0) {
  /** fire-and-forget で生成リクエスト */
  for (const pending of result.pending_rewards) {
    fetch("/api/internal/rewards/generate", {
      body: JSON.stringify(pending),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).catch(() => { /* 失敗しても無視。自己修復に任せる */ })
  }

  /** ホーム遷移後の popup 起動用に sessionStorage に保存 */
  sessionStorage.setItem("pendingRewards", JSON.stringify({
    items: result.pending_rewards,
    startedAt: Date.now(),
  }))
}
```

`/api/internal/rewards/generate` は apps/web の Route Handler（accessToken 付きで Express api に転送）。

### ホーム画面の popup component

`apps/web/src/components/pending-rewards-popup.tsx`（新規）:

```typescript
"use client"

export const PendingRewardsPopup = () => {
  const [completed, setCompleted] = useState<Reward[] | null>(null)
  const [polling, setPolling] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem("pendingRewards")
    if (!raw) return
    const { items, startedAt } = JSON.parse(raw) as { items: PendingReward[], startedAt: number }
    if (Date.now() - startedAt > 60_000) {
      /** 1 分以上経過していたら諦める（マイページから取得すれば良い） */
      sessionStorage.removeItem("pendingRewards")
      return
    }
    setPolling(true)
    let attempts = 0
    const interval = setInterval(async () => {
      attempts++
      try {
        const res = await fetch("/api/internal/rewards/me")
        const data = await res.json() as { rewards: Reward[] }
        const matched = data.rewards.filter(r =>
          items.some(i => i.type === r.type
            && i.language === (r.payload as { language: string }).language
            && (i.year_month === undefined || i.year_month === (r.payload as { year_month?: string }).year_month))
          && r.asset_url !== null && r.asset_svg_url !== null,
        )
        if (matched.length === items.length || attempts >= 10) {
          clearInterval(interval)
          setPolling(false)
          if (matched.length > 0) setCompleted(matched)
          sessionStorage.removeItem("pendingRewards")
        }
      } catch {
        if (attempts >= 10) { clearInterval(interval); setPolling(false) }
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  if (!completed) return null

  return (
    <Modal onClose={() => setCompleted(null)}>
      <h2>新しい特典を獲得しました！</h2>
      {completed.map(reward => (
        <RewardPreview key={reward.id} reward={reward} />
      ))}
    </Modal>
  )
}

const RewardPreview = ({ reward }: { reward: Reward }) => {
  return (
    <div>
      <img src={reward.asset_url!} alt="達成カード" width={600} />
      <div dangerouslySetInnerHTML={{ __html: reward.asset_svg_url! }} />
      <a href={reward.asset_url!} download>PNG をダウンロード</a>
      <a href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(reward.asset_svg_url!)}`} download={`badge-${reward.type}.svg`}>SVG をダウンロード</a>
    </div>
  )
}
```

### ホーム画面への組み込み

`apps/web/src/app/page.tsx` の最下層に `<PendingRewardsPopup />` を配置。クライアントコンポーネントなのでマウント直後に sessionStorage を読みに行く。

### Route Handler（apps/web 内部）

- `apps/web/src/app/api/internal/rewards/generate/route.ts` — `POST` で Express api に転送
- `apps/web/src/app/api/internal/rewards/me/route.ts` — `GET` で Express api に転送

両方とも `getAccessToken()` で JWT を取得して `Authorization: Bearer ...` ヘッダで上流に送る。

## 動作確認

### Playwright E2E（`verify-web-page` skill を呼ぶ）

1. dev サーバを起動
2. dev-login で `alice` としてログイン
3. プレイ → リザルトで TOP 10 入賞させる（debug page で score を仕込む）
4. リザルト画面が表示されたら sessionStorage に `pendingRewards` が入っていることを console で確認
5. ホームに戻る
6. 数秒後にポップアップが表示されることを確認、PNG と SVG のプレビューが見える
7. DL ボタンが機能する

### ユニットテスト

- `PendingRewardsPopup` の polling ロジック（最大 10 回、2 秒間隔、1 分タイムアウト）を vitest + msw でカバー
- sessionStorage がない / 期限切れ / 部分完了の各分岐を網羅
