"use client"

import { useActionState } from "react"

import { GetUserResponse } from "@repo/api-schema"

import { submitOnboardingAction } from "./actions"

type Props = {
  initialUser: GetUserResponse
}

export function OnboardingForm({ initialUser }: Props) {
  const [state, formAction, isPending] = useActionState(submitOnboardingAction, {})

  return (
    <form action={formAction}>
      <div className="mb-16">
        <div className="text-sm">表示名</div>
        <div
          className="text-mono"
          style={{
            background: "var(--bg-base)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            color: "var(--text-muted)",
            marginTop: "6px",
            padding: "8px 12px",
          }}
        >
          @{initialUser.github_username ?? `user${initialUser.id}`}
        </div>
        <p className="text-xs text-muted mt-8">
          GitHub のユーザー名で固定 (編集不可)。ランキング・リプレイでの表示名としても使われます。
        </p>
      </div>

      <div
        className="flex-between mb-16"
        style={{ border: "1px solid var(--border)", borderRadius: "6px", padding: "12px 14px" }}
      >
        <div>
          <p className="text-sm" style={{ fontWeight: 600 }}>ランキングに掲載する</p>
          <p className="text-xs text-muted mt-8">
            OFF にすると順位そのものが計算されず、トップ 10 や自分の順位表示に一切現れません。
          </p>
        </div>
        <input
          defaultChecked={initialUser.can_public_ranking}
          id="can_public_ranking"
          name="can_public_ranking"
          style={{ height: "20px", width: "20px" }}
          type="checkbox"
        />
      </div>

      {state.error && (
        <p
          className="card mb-16"
          style={{ borderColor: "var(--error)", color: "var(--error)", padding: "10px 14px" }}
        >
          {state.error}
        </p>
      )}

      <button className="btn btn-primary btn-block" disabled={isPending} type="submit">
        {isPending ? "保存中…" : "はじめる"}
      </button>
    </form>
  )
}
