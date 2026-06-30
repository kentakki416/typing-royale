import "server-only"

import { GetMyRankingResponse, GetUserResponse } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"
import { getLanguages } from "@/libs/languages"

/**
 * マイページ共通ヘッダー（{@link MyPageHeader}）に必要なデータを取得する（Server 専用）。
 *
 * /api/user と全言語の自分ランキングを並列取得し、全言語通算グレードを解決する。
 * グレードは言語に依らず同一なので、ランキングが取れた最初の言語から取り出す。
 * サマリーページは自前で全ランキングを使うため本ヘルパは使わず、特典 / 設定ページが利用する。
 */
export async function getMyPageHeaderData(): Promise<{
  grade: GetMyRankingResponse["grade"] | null
  me: GetUserResponse
}> {
  const languages = await getLanguages()
  const [me, rankings] = await Promise.all([
    apiClient.get<GetUserResponse>("/api/user"),
    Promise.all(
      languages.map(async (language) =>
        apiClient
          .get<GetMyRankingResponse>(`/api/rankings/me?language=${language.slug}`)
          .then((ranking) => ranking)
          .catch(() => null as GetMyRankingResponse | null),
      ),
    ),
  ])
  const grade = rankings.find((ranking) => ranking !== null)?.grade ?? null
  return { grade, me }
}
