"use client"

import { useActionState } from "react"

import { GetUserResponse } from "@repo/api-schema"

import { submitOnboardingAction } from "./actions"

type Props = {
  initialUser: GetUserResponse
}

const inputStyle = {
  background: "var(--bg-base)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  color: "var(--text-primary)",
  display: "block",
  fontFamily: "var(--font-sans)",
  marginTop: "6px",
  padding: "8px 12px",
  width: "100%",
}

export function OnboardingForm({ initialUser }: Props) {
  const [state, formAction, isPending] = useActionState(submitOnboardingAction, {})

  return (
    <form action={formAction}>
      <div className="mb-16">
        <label className="text-sm" htmlFor="display_name">表示名</label>
        <input
          defaultValue={initialUser.display_name ?? ""}
          id="display_name"
          maxLength={50}
          minLength={1}
          name="display_name"
          required
          style={inputStyle}
          type="text"
        />
        <p className="text-xs text-muted mt-8">
          GitHub のユーザー名を初期値にしています。1〜50 文字。
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
