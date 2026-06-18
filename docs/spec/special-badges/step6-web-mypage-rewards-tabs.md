# step6: マイページ rewards タブ拡張

既存 `/mypage/rewards` の単一一覧を「グレードアップ / 殿堂入り / 月間」の 3 タブに分け、各 reward に SVG / PNG の個別 DL ボタンと README 用 URL コピーボタンを追加する。

## 対応内容

### 既存実装の確認

`apps/web/src/app/mypage/rewards/page.tsx` で `GET /api/internal/rewards/me` を SSR で叩いて全 reward を表示している。step2 で response schema に `asset_svg_url` を追加済みなので、UI 側でタブ分割と DL ボタンを追加するだけで済む。

### タブ分割

```tsx
const tabsConfig = [
  { key: "grade_up", label: "グレードアップ", icon: "🚀" },
  { key: "hall_of_fame_in", label: "殿堂入り", icon: "👑" },
  { key: "monthly_top_ten", label: "月間 TOP 10", icon: "🏆" },
] as const

export default async function RewardsPage() {
  const rewards = await fetchMyRewards()  // 既存
  const grouped = {
    grade_up: rewards.filter(r => r.type === "grade_up"),
    hall_of_fame_in: rewards.filter(r => r.type === "hall_of_fame_in"),
    monthly_top_ten: rewards.filter(r => r.type === "monthly_top_ten"),
  }

  return (
    <RewardsTabs rewards={grouped} />
  )
}
```

### `RewardsTabs` Client Component

```tsx
"use client"

export const RewardsTabs = ({ rewards }: { rewards: GroupedRewards }) => {
  const [active, setActive] = useState<keyof GroupedRewards>("grade_up")

  return (
    <>
      <nav className="tabs">
        {tabsConfig.map(t => (
          <button
            aria-selected={active === t.key}
            className={active === t.key ? "tab tab-active" : "tab"}
            key={t.key}
            onClick={() => setActive(t.key)}
            type="button"
          >
            {t.icon} {t.label} ({rewards[t.key].length})
          </button>
        ))}
      </nav>
      <div className="grid">
        {rewards[active].map(r => <RewardCard key={r.id} reward={r} />)}
      </div>
    </>
  )
}

const RewardCard = ({ reward }: { reward: Reward }) => {
  const [copied, setCopied] = useState(false)
  const badgeUrl = reward.type === "hall_of_fame_in"
    ? `https://typing-royale.com/badge/${reward.username}/hall-of-fame.svg?language=${reward.payload.language}`
    : reward.type === "monthly_top_ten"
    ? `https://typing-royale.com/badge/${reward.username}/monthly.svg?language=${reward.payload.language}`
    : null  // grade_up は既存のバッジ URL

  const onCopyMarkdown = () => {
    navigator.clipboard.writeText(`![](${badgeUrl})`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <article>
      {reward.asset_url && <img alt="達成カード" src={reward.asset_url} />}
      {reward.asset_svg_url && <div dangerouslySetInnerHTML={{ __html: reward.asset_svg_url }} />}
      <div className="actions">
        {reward.asset_url && <a download href={reward.asset_url}>PNG DL</a>}
        {reward.asset_svg_url && <a download={`badge-${reward.id}.svg`} href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(reward.asset_svg_url)}`}>SVG DL</a>}
        {badgeUrl && (
          <button onClick={onCopyMarkdown} type="button">
            {copied ? "コピー済み" : "README 用 Markdown をコピー"}
          </button>
        )}
      </div>
    </article>
  )
}
```

### 既存タブ UI との整合

`/mypage` のメインタブ（概要 / 特典 / プレイ履歴 / バッジ / 設定）はそのまま。今回触るのは「特典」配下の中タブ。

## 動作確認

### Playwright E2E（`verify-web-page` skill）

1. dev-login で alice として `/mypage/rewards` を開く
2. 3 タブが表示され、件数バッジ（`グレードアップ (2)` 等）が出る
3. タブをクリックして表示が切り替わる
4. 各カードに PNG DL / SVG DL / Markdown コピーボタンがある
5. PNG DL クリックでファイルが落ちる（ヘッドレスでは `Content-Disposition` を assert）
6. Markdown コピーボタンが「コピー済み」表示に変わる
7. before/after スクショを `docs/screenshots/special-badges/mypage-{before,after}.png` に保存
