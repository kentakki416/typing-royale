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
    <form action={formAction} className="space-y-4">
      <div>
        <label
          className="block text-sm font-medium text-gray-700 dark:text-zinc-200"
          htmlFor="display_name"
        >
          表示名
        </label>
        <input
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          defaultValue={initialUser.display_name ?? ""}
          id="display_name"
          maxLength={50}
          minLength={1}
          name="display_name"
          required
          type="text"
        />
        <p className="mt-1 text-xs text-gray-500">
          GitHub のユーザー名を初期値にしています。1〜50 文字。
        </p>
      </div>

      <div className="flex items-center justify-between rounded border border-gray-200 px-3 py-3 dark:border-zinc-700">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-zinc-200">ランキングに掲載する</p>
          <p className="text-xs text-gray-500">
            OFF にすると順位そのものが計算されず、トップ 10 や自分の順位表示に一切現れません。
          </p>
        </div>
        <input
          className="h-5 w-5"
          defaultChecked={initialUser.can_public_ranking}
          id="can_public_ranking"
          name="can_public_ranking"
          type="checkbox"
        />
      </div>

      {state.error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <button
        className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "保存中…" : "はじめる"}
      </button>
    </form>
  )
}
