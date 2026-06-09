import type { User } from "../../types/domain"

/**
 * ドメイン User をレスポンス用 snake_case object に詰め替える
 *
 * Auth (Google / GitHub / dev-login) / GET /api/user / PATCH /api/user の
 * レスポンスはいずれも同じ User shape を返すため共通化する。
 *
 * Auth 系レスポンススキーマは `favorite_repo_url` を含まないが、
 * Zod の `z.object()` は未知キーをデフォルトで strip するため余分なフィールドは
 * 自動的に落ちる（既存挙動と一致）。
 */
export const toUserDto = (user: User) => ({
  avatar_url: user.avatarUrl,
  can_public_ranking: user.canPublicRanking,
  created_at: user.createdAt.toISOString(),
  display_name: user.displayName,
  email: user.email,
  favorite_repo_url: user.favoriteRepoUrl,
  id: user.id,
})
