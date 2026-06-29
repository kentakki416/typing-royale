import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import type { GetReplayResponse } from "@repo/api-schema"

import { Topbar } from "@/components/topbar"
import { apiClient } from "@/libs/api-client"
import { getAccessToken } from "@/libs/auth"

import { ReplayPlayer } from "./replay-player"

export const metadata: Metadata = {
  title: "リプレイ - Typing Royale",
}

/**
 * /replay/[playSessionId]
 *
 * Server Component で `/api/replays/:playSessionId` を 1 回叩き、
 * 結果を ReplayPlayer Client Component に渡す。404 は notFound() で
 * 専用 not-found.tsx に流す
 */
export default async function ReplayPage({
  params,
}: {
    params: Promise<{ playSessionId: string }>
}) {
  const { playSessionId } = await params

  let data: GetReplayResponse
  try {
    data = await apiClient.get<GetReplayResponse>(`/api/replays/${playSessionId}`)
  } catch {
    notFound()
  }
  const accessToken = await getAccessToken()

  return (
    <>
      <Topbar active="ranking" isAuthed={accessToken !== null} />

      <div className="container container-wide">
        <div className="text-sm text-muted mb-8">
          <Link href="/ranking">← ランキング</Link>
        </div>
        <ReplayPlayer data={data} />
      </div>
    </>
  )
}
