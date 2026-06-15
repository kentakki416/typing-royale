# step4: Web — ホーム画面の「月間トップ」カード

ホーム画面の「🏆 全期間トップ」placeholder を、月間トップ 5（言語別 2 カラム）に置き換える。

## 対応内容

### Route Handler を作る or 直接 fetch するか

Server Component から `apiClient.get` で叩く方針（既存の home page と同じ。`apps/web/CLAUDE.md` の「データ取得は Server Component で直接」ルール）。Route Handler は不要。

### Server Component（`apps/web/src/app/page.tsx` の修正）

```tsx
import type { GetMonthlyRankingsResponse } from "@repo/api-schema"

import { MonthlyTopCard } from "@/components/monthly-top-card"

export default async function HomePage() {
  /** 既存の featured と並列で fetch */
  const [featured, tsMonthly, jsMonthly] = await Promise.all([
    apiClient.get<GetFeaturedReplaysResponse>("/api/replays/featured?limit=3").catch(() => ({ items: [] })),
    apiClient.get<GetMonthlyRankingsResponse>("/api/rankings/monthly?language=typescript&limit=5").catch(() => ({ year_month: "", entries: [] })),
    apiClient.get<GetMonthlyRankingsResponse>("/api/rankings/monthly?language=javascript&limit=5").catch(() => ({ year_month: "", entries: [] })),
  ])

  return (
    <>
      {/* ... 既存 hero ... */}

      <div className="container">
        <div className="row">
          <div className="col">
            {/* ... 既存 god-frame ... */}

            {/* ✅ 旧「🏆 全期間トップ」placeholder をこのカードで置き換え */}
            <div className="card mb-24">
              <div className="card-header">
                <div className="card-title">🏆 月間トップ</div>
                <Link className="text-sm" href="/ranking">全期間ランキング →</Link>
              </div>
              <div className="row gap-16">
                <div className="col">
                  <MonthlyTopCard language="TypeScript" data={tsMonthly} />
                </div>
                <div className="col">
                  <MonthlyTopCard language="JavaScript" data={jsMonthly} />
                </div>
              </div>
            </div>

            {/* ... 既存 "なぜ Typing Royale か" ... */}
          </div>
          {/* ... 既存 aside ... */}
        </div>
      </div>
    </>
  )
}
```

### Client/Server 判定不要のシンプルな表示コンポーネント

`apps/web/src/components/monthly-top-card.tsx`（Server Component で十分）：

```tsx
import type { GetMonthlyRankingsResponse } from "@repo/api-schema"

type Props = {
  data: GetMonthlyRankingsResponse
  language: string
}

/**
 * 1 言語ぶんの月間トップ 5 を縦に並べる小コンポーネント。
 * year_month が空 ("") のときは API 失敗扱いで「集計準備中」を出す
 */
export function MonthlyTopCard({ data, language }: Props) {
  const monthLabel = data.year_month === "" ? "" : formatYearMonthJa(data.year_month)

  return (
    <div>
      <div className="flex-between mb-8">
        <div className="text-sm" style={{ fontWeight: 600 }}>{language}</div>
        {monthLabel !== "" && <div className="text-xs text-muted">{monthLabel}</div>}
      </div>

      {data.entries.length === 0 ? (
        <div className="text-sm text-muted text-center" style={{ padding: "24px 0" }}>
          {data.year_month === "" ? "集計準備中" : "まだエントリがありません"}
        </div>
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {data.entries.map((entry) => (
            <li
              className="flex-between"
              key={entry.user.id}
              style={{
                alignItems: "center",
                borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                gap: "8px",
                padding: "8px 0",
              }}
            >
              <div className="flex gap-8" style={{ alignItems: "center", minWidth: 0 }}>
                <span className="text-mono text-muted" style={{ minWidth: "20px", textAlign: "right" }}>
                  {entry.rank}
                </span>
                <span className="player-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.user.display_name}
                </span>
              </div>
              <div className="text-mono text-sm" style={{ flexShrink: 0 }}>{entry.score.toLocaleString()}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

const formatYearMonthJa = (yearMonth: string): string => {
  const [y, m] = yearMonth.split("-")
  return `${y} 年 ${Number(m)} 月`
}
```

### apiClient のキャッシュ

- ホーム画面は SSR で毎リクエスト fetch
- `apiClient` 側で fetch 時の `cache: "no-store"` 等を既存の設計に合わせる（既存の rankings 取得と同じ扱い）
- 月間トップは「最大 1 時間遅れの集計」なので、SSR + revalidate なしで十分

## 動作確認

- ローカルで `pnpm dev` を起動した状態で、月初〜月末のあいだに以下を確認：

  - DB に当月のスナップショット (`monthly_ranking_snapshots`) を 2 言語ぶん仕込む
  - http://localhost:3000/ を開き、ホーム画面の「🏆 月間トップ」カードに TS / JS 横並びで TOP 5 が出る
  - スナップショットが空の言語は「まだエントリがありません」が出る
  - API が落ちた場合（`apiClient` がエラー）は「集計準備中」が出てページ全体は描画される（catch でフォールバック）

- Playwright e2e:

  ```ts
  test("ホーム画面に月間トップカードが表示される", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { name: /月間トップ/ })).toBeVisible()
    /** スナップショットの有無に依らず TypeScript / JavaScript のラベルは出る */
    await expect(page.getByText("TypeScript")).toBeVisible()
    await expect(page.getByText("JavaScript")).toBeVisible()
  })
  ```

- 「全期間ランキング →」リンクは既存の `/ranking` 画面を指す（こちらは触らない）
