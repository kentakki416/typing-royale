# step2-web: 言語タブの動的化（getLanguages + Data Cache）

各画面の `SUPPORTED_LANGUAGES`（ハードコード）を、API 取得 + Next.js Data Cache に置き換える。`apps/web/CLAUDE.md` の「サーバーサイド経由で API を叩く」「Server Component で取得」に従う。

## 対応内容

### 1. getLanguages() ヘルパ（`apps/web/src/libs/languages.ts`）

Server 専用。`fetch` の `next.revalidate` + `tags` で Data Cache に乗せる。**失敗・0 件時は空配列を返し throw しない**（ページ全体を 500 にしないため）。

```typescript
import "server-only"

import { env } from "@/env"

export type Language = {
  id: number
  name: string
  slug: string
}

/**
 * 言語マスタを取得する。Next.js Data Cache（tag: "languages"）で
 * 全画面・全リクエストで共有し、API は実質 24h に 1 回しか叩かれない。
 * 言語追加直後に最新化したいときは revalidateTag("languages") を呼ぶ。
 */
export async function getLanguages(): Promise<Language[]> {
  try {
    const res = await fetch(`${env.API_URL}/api/languages`, {
      next: { revalidate: 86400, tags: ["languages"] },
    })
    if (!res.ok) return []
    const data = (await res.json()) as { languages?: Language[] }
    return data.languages ?? []
  } catch {
    return []
  }
}

/**
 * クエリ等で渡ってきた slug を検証して「選択中の言語」を決める。
 * 無効 / 未指定なら一覧の先頭。一覧が空なら null。
 */
export function resolveSelectedLanguage(
  languages: Language[],
  rawSlug?: string,
): string | null {
  if (rawSlug && languages.some((l) => l.slug === rawSlug)) return rawSlug
  return languages[0]?.slug ?? null
}
```

> `apiClient` ではなく素の `fetch` を使うのは、`next.revalidate` / `tags`（Data Cache 制御）を渡すため。認証不要の公開エンドポイントなので apiClient の cookie 連携は不要。

### 2. 各ページの置き換え（ranking を例に）

`apps/web/src/app/ranking/page.tsx` の `SUPPORTED_LANGUAGES` / `LANGUAGE_LABELS` を削除し、`getLanguages()` に置き換える。

```tsx
import { getLanguages, resolveSelectedLanguage } from "@/libs/languages"

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ language?: string }>
}) {
  const { language: rawLang } = await searchParams
  const languages = await getLanguages()
  const language = resolveSelectedLanguage(languages, rawLang)

  // ★ データが無い場合のハンドリング（本来発生しない）
  if (language === null) {
    return <EmptyLanguagesState />
  }

  // ... 既存のランキング取得（language を使用）...

  return (
    <>
      {/* タブ: マスタの一覧から描画 */}
      <div className="lang-tabs">
        {languages.map((lang) => (
          <Link
            key={lang.slug}
            href={`/ranking?language=${lang.slug}`}
            className={lang.slug === language ? "active" : ""}
          >
            {lang.name}
          </Link>
        ))}
      </div>
      {/* ... */}
    </>
  )
}
```

同様に置き換える対象:

| ファイル | 置き換え |
|---|---|
| `app/ranking/page.tsx` | `SUPPORTED_LANGUAGES` / `LANGUAGE_LABELS` → `getLanguages()` |
| `app/crawled-repos/page.tsx` | 同上 |
| `app/hall-of-fame/page.tsx` | 同上 |
| `app/play/page.tsx` | 言語選択タブを `getLanguages()` に |
| `app/page.tsx`（home） | 月間トップ / サイドバーの言語タブを `getLanguages()` に |

### 3. 空状態コンポーネント（`EmptyLanguagesState`）

`apps/web/src/app/_components/empty-languages-state.tsx`（配置は既存慣習に合わせる）。各ページで共通利用する小さな Server Component。

```tsx
export function EmptyLanguagesState() {
  return (
    <div className="card text-center">
      <p>対応言語が準備中です</p>
      <p className="text-muted text-sm">
        しばらくしてから再度お試しください。
      </p>
    </div>
  )
}
```

> 言語マスタは migration で必ず投入されるため通常は表示されないが、API 障害・空 DB の防御として用意する。

### 4. 既存の直値参照について

`players/[userId]/page.tsx` や `mypage` の `slug === "typescript"` のような **特定言語を名指しする箇所は本 PR の対象外**（タブの動的一覧とは別の用途）。タブ（`SUPPORTED_LANGUAGES`）の動的化に限定する。

## 動作確認

`apps/web/CLAUDE.md` の「Playwright MCP で実画面確認」に従う。

- `pnpm --filter web build` で型・ルートが通る。
- Playwright で各ページを開き:
  - 言語タブが **API のマスタどおり**（TypeScript / JavaScript）描画される。
  - タブ切替で `?language=<slug>` に遷移し、選択状態が変わる。
  - `console_messages` の error が 0 件。
- Data Cache の確認: 2 回目以降のリクエストで API（`/api/languages`）が叩かれない（API ログ / ネットワークで確認）。
- 空状態の確認: ローカルで `languages` を空にした状態（または `getLanguages` を一時的に `[]` 返し）で各ページが 500 にならず空状態 UI を出す。
