import "server-only"

import { GetLanguagesResponse, LanguageItem } from "@repo/api-schema"

import { env } from "@/env"

/**
 * 言語マスタを取得する（Server 専用）。
 *
 * Next.js Data Cache（tag: "languages"）で全画面・全リクエストで共有し、
 * API は実質 24h に 1 回しか叩かれない。言語を追加した直後に最新化したいときは
 * `revalidateTag("languages")` を呼ぶ。
 *
 * API 失敗 / 0 件のときは空配列を返す（throw しない＝ページ全体を 500 にしない）。
 */
export async function getLanguages(): Promise<LanguageItem[]> {
  try {
    const res = await fetch(`${env.API_URL}/api/languages`, {
      next: { revalidate: 86400, tags: ["languages"] },
    })
    if (!res.ok) return []
    const data = (await res.json()) as GetLanguagesResponse
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
  languages: LanguageItem[],
  rawSlug?: string,
): string | null {
  if (rawSlug && languages.some((lang) => lang.slug === rawSlug)) {
    return rawSlug
  }
  return languages[0]?.slug ?? null
}
