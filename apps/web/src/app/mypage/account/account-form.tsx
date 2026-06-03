"use client"

import { useActionState, useState } from "react"

import { GetUserResponse } from "@repo/api-schema"

import { deleteAccountAction, updateProfileAction } from "./actions"

type Props = {
  initialUser: GetUserResponse
}

/**
 * アカウント設定フォーム（Client Component）
 *
 * - 表示名 / ランキング公開設定の更新は useActionState で楽観的に状態管理
 * - アカウント削除は確認モーダル経由で deleteAccountAction を呼ぶ
 */
export function AccountForm({ initialUser }: Props) {
  const [state, formAction, isPending] = useActionState(updateProfileAction, {})
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const displayUser = state.user ?? initialUser

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-medium text-black dark:text-zinc-50">プロフィール</h2>

        <form action={formAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-200" htmlFor="display_name">
              表示名
            </label>
            <input
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              defaultValue={displayUser.display_name ?? ""}
              id="display_name"
              maxLength={50}
              minLength={1}
              name="display_name"
              type="text"
            />
            <p className="mt-1 text-xs text-gray-500">1〜50 文字。ランキング・リプレイで表示されます。</p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-200" htmlFor="can_public_ranking">
                ランキング掲載
              </label>
              <p className="text-xs text-gray-500">
                OFF にするとランキング集計から完全に除外されます（順位が計算されません）。
              </p>
            </div>
            <input
              className="h-5 w-5"
              defaultChecked={displayUser.can_public_ranking}
              id="can_public_ranking"
              name="can_public_ranking"
              type="checkbox"
            />
          </div>

          {state.error && (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
          )}
          {state.success && (
            <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">更新しました。</p>
          )}

          <button
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={isPending}
            type="submit"
          >
            {isPending ? "更新中…" : "保存"}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-red-200 bg-white p-6 dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-medium text-red-700">アカウント削除</h2>
        <p className="text-sm text-gray-600 dark:text-zinc-300">
          アカウント、スコア、リプレイ、Hall of Fame 掲載を含む全データを即時削除します。
          この操作は取り消せません。
        </p>

        {!showDeleteConfirm && (
          <button
            className="mt-4 rounded border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
            onClick={() => setShowDeleteConfirm(true)}
            type="button"
          >
            アカウントを削除する
          </button>
        )}

        {showDeleteConfirm && (
          <form action={deleteAccountAction} className="mt-4 space-y-3">
            <p className="text-sm font-medium text-red-700">
              本当に削除しますか？元に戻すことはできません。
            </p>
            <div className="flex gap-2">
              <button
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                type="submit"
              >
                削除を確定
              </button>
              <button
                className="rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
                onClick={() => setShowDeleteConfirm(false)}
                type="button"
              >
                キャンセル
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
