import type { Metadata } from "next"
import Link from "next/link"

import { GetUserResponse } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

import { AccountForm } from "./account-form"

export const metadata: Metadata = {
  title: "アカウント設定",
}

export default async function AccountSettingsPage() {
  const me = await apiClient.get<GetUserResponse>("/api/user")

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10 dark:bg-black">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">アカウント設定</h1>
          <Link
            className="text-sm text-blue-600 underline hover:text-blue-800"
            href="/mypage"
          >
            ← マイページに戻る
          </Link>
        </div>

        <AccountForm initialUser={me} />
      </div>
    </main>
  )
}
