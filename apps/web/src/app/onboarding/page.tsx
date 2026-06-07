import type { Metadata } from "next"

import { GetUserResponse } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

import { OnboardingForm } from "./onboarding-form"

export const metadata: Metadata = {
  title: "ようこそ - Typing Royale",
}

/**
 * 初回ログイン後のオンボーディング画面（mock: onboarding.html 準拠）
 *
 * GitHub から取得した表示名と、ランキング公開可否を確認する。
 * 確認内容はあとから /mypage/account でも変更できる。
 */
export default async function OnboardingPage() {
  const me = await apiClient.get<GetUserResponse>("/api/user")

  return (
    <main
      className="container container-narrow"
      style={{
        alignItems: "center",
        display: "flex",
        justifyContent: "center",
        minHeight: "100vh",
        paddingTop: "32px",
      }}
    >
      <div className="card" style={{ maxWidth: "480px", padding: "32px", width: "100%" }}>
        <div className="text-center mb-24">
          <div className="logo" style={{ fontSize: "20px" }}>
            <span className="accent">Typing</span> Royale
          </div>
          <h1 className="mt-16">ようこそ</h1>
          <p className="text-muted text-sm mt-8">
            最初に表示名とランキング公開設定を確認しましょう。あとから変更できます。
          </p>
        </div>

        <OnboardingForm initialUser={me} />
      </div>
    </main>
  )
}
