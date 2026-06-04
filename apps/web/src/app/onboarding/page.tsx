import type { Metadata } from "next"

import { GetUserResponse } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

import { OnboardingForm } from "./onboarding-form"

export const metadata: Metadata = {
  title: "ようこそ",
}

/**
 * 初回ログイン後のオンボーディング画面
 *
 * GitHub から取得した表示名と、ランキング公開可否を確認する。
 * 確認内容はあとから /mypage/account でも変更できる。
 */
export default async function OnboardingPage() {
  const me = await apiClient.get<GetUserResponse>("/api/user")

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-10 dark:bg-black">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-gray-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            ようこそ
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            最初に表示名とランキング公開設定を確認しましょう。あとから変更できます。
          </p>
        </div>

        <OnboardingForm initialUser={me} />
      </div>
    </main>
  )
}
