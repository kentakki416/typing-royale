import type { Metadata } from "next"
import Link from "next/link"

import { GetUserResponse } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"
import { logoutAction } from "@/libs/auth-actions"

export const metadata: Metadata = {
  title: "マイページ",
}

/**
 * マイページ > ホーム
 *
 * Phase 1 ではグレード・ベストスコア・ランキング順位・累計打鍵数 / 連続日数の表示枠だけ作る。
 * 中身は Phase 4 (スコア・ランキング + エンジニアグレード) で実装する。
 */
export default async function MyPage() {
  const me = await apiClient.get<GetUserResponse>("/api/user")

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10 dark:bg-black">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">マイページ</h1>
          <div className="flex items-center gap-3">
            <Link
              className="text-sm text-blue-600 underline hover:text-blue-800"
              href="/mypage/account"
            >
              アカウント設定
            </Link>
            <form action={logoutAction}>
              <button
                className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
                type="submit"
              >
                ログアウト
              </button>
            </form>
          </div>
        </header>

        {/* プロフィール */}
        <section className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          {me.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="h-16 w-16 rounded-full"
              src={me.avatar_url}
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-gray-200" />
          )}
          <div>
            <p className="text-lg font-medium text-black dark:text-zinc-50">
              {me.display_name ?? "(no name)"}
            </p>
            <p className="text-sm text-gray-500">
              ランキング掲載：{me.can_public_ranking ? "ON" : "OFF"}
            </p>
          </div>
        </section>

        {/* エンジニアグレード（Phase 4 で実装） */}
        <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-sm font-medium text-gray-500">現在のエンジニアグレード</h2>
          <p className="text-3xl font-bold text-gray-300">Coming soon</p>
          <p className="mt-2 text-xs text-gray-400">
            Phase 4 でスコア・ランキング機能とともに表示します。
          </p>
        </section>

        {/* 集計値の枠（Phase 4 で実装） */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "ベストスコア" },
            { label: "全期間順位" },
            { label: "累計打鍵数" },
            { label: "連続日数" },
          ].map((stat) => (
            <div
              className="rounded border border-gray-200 bg-white p-4 text-center dark:border-zinc-800 dark:bg-zinc-900"
              key={stat.label}
            >
              <p className="text-xs text-gray-500">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold text-gray-300">—</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
