"use client"

import { useActionState, useState } from "react"

import { GetUserResponse } from "@repo/api-schema"

import { deleteAccountAction, updateProfileAction } from "./actions"

type Props = {
  initialUser: GetUserResponse
}

/**
 * アカウント設定フォーム（Client Component / mock styles 準拠）
 *
 * - 表示名 / ランキング公開設定の更新は useActionState で状態管理
 * - アカウント削除は確認モーダル経由で deleteAccountAction を呼ぶ
 */
export function AccountForm({ initialUser }: Props) {
  const [state, formAction, isPending] = useActionState(updateProfileAction, {})
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const displayUser = state.user ?? initialUser

  return (
    <>
      <div className="card mb-16">
        <div className="card-header"><div className="card-title">プロフィール</div></div>

        <form action={formAction}>
          <div className="mb-16">
            <label className="text-sm" htmlFor="display_name">表示名</label>
            <input
              defaultValue={displayUser.display_name ?? ""}
              id="display_name"
              maxLength={50}
              minLength={1}
              name="display_name"
              style={{
                background: "var(--bg-base)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                color: "var(--text-primary)",
                display: "block",
                fontFamily: "var(--font-sans)",
                marginTop: "6px",
                padding: "8px 12px",
                width: "100%",
              }}
              type="text"
            />
            <p className="text-xs text-muted mt-8">1〜50 文字。ランキング・リプレイで表示されます。</p>
          </div>

          <div className="mb-16">
            <label className="text-sm" htmlFor="favorite_repo_url">お気に入りリポジトリ URL</label>
            <input
              defaultValue={displayUser.favorite_repo_url ?? ""}
              id="favorite_repo_url"
              maxLength={200}
              name="favorite_repo_url"
              placeholder="https://github.com/owner/repo"
              style={{
                background: "var(--bg-base)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                color: "var(--text-primary)",
                display: "block",
                fontFamily: "var(--font-sans)",
                marginTop: "6px",
                padding: "8px 12px",
                width: "100%",
              }}
              type="url"
            />
            <p className="text-xs text-muted mt-8">
              殿堂入りモーダルで「お気に入りリポジトリ」として公開されます。空欄で削除。
            </p>
          </div>

          <div className="flex-between mb-16">
            <div>
              <label className="text-sm" htmlFor="can_public_ranking">ランキング掲載</label>
              <p className="text-xs text-muted">
                OFF にするとランキング集計から完全に除外されます（順位が計算されません）。
              </p>
            </div>
            <input
              defaultChecked={displayUser.can_public_ranking}
              id="can_public_ranking"
              name="can_public_ranking"
              style={{ height: "20px", width: "20px" }}
              type="checkbox"
            />
          </div>

          {state.error && (
            <p className="card mb-16" style={{ borderColor: "var(--error)", color: "var(--error)" }}>
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="card mb-16" style={{ borderColor: "var(--success)", color: "var(--success)" }}>
              更新しました。
            </p>
          )}

          <button className="btn btn-primary" disabled={isPending} type="submit">
            {isPending ? "更新中…" : "保存"}
          </button>
        </form>
      </div>

      <div className="card mb-16" style={{ borderColor: "rgba(248, 81, 73, 0.4)" }}>
        <div className="card-header">
          <div className="card-title" style={{ color: "var(--error)" }}>⚠ アカウント削除</div>
        </div>
        <p className="text-sm text-muted mb-16">
          アカウント、スコア、リプレイ、殿堂入り掲載を含む全データを即時削除します。
          この操作は取り消せません。
        </p>

        {!showDeleteConfirm && (
          <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)} type="button">
            アカウントを削除する
          </button>
        )}

        {showDeleteConfirm && (
          <form action={deleteAccountAction}>
            <p className="text-sm mb-16" style={{ color: "var(--error)", fontWeight: 600 }}>
              本当に削除しますか？元に戻すことはできません。
            </p>
            <div className="flex gap-8">
              <button className="btn btn-danger" type="submit">削除を確定</button>
              <button className="btn" onClick={() => setShowDeleteConfirm(false)} type="button">
                キャンセル
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  )
}
