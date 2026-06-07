import type { Metadata } from "next"

import { LanguageSelector } from "./language-selector"

export const metadata: Metadata = {
  title: "Typing Royale",
}

/**
 * MVP では言語マスタを取得する API がまだ無いため、ハードコードで TypeScript /
 * JavaScript を出す。DB seed の id 1/2 と一致させること
 */
const SUPPORTED_LANGUAGES = [
  { id: 1, name: "TypeScript", slug: "typescript" },
  { id: 2, name: "JavaScript", slug: "javascript" },
] as const

/**
 * トップ = 言語選択画面
 * 認証は proxy.ts が cookie 有無で振り分けるので、ここで isAuthenticated を呼ばない
 */
export default function HomePage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="mx-auto w-full max-w-2xl space-y-10">
        <header className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">Typing Royale</h1>
          <p className="text-sm text-gray-500">
            120 秒で OSS の関数をどれだけ打鍵できるか。
          </p>
        </header>

        <LanguageSelector languages={SUPPORTED_LANGUAGES} />
      </div>
    </main>
  )
}
