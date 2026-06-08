import { NextResponse } from "next/server"

import { env } from "@/env"

/**
 * GET /api/internal/badge-preview/:username
 *
 * マイページバッジ設定画面のプレビュー <img> から呼ばれる。
 * Express API の GET /badge/:username.svg を proxy して SVG を返す。
 *
 * 直接 ${API_URL}/badge/:username.svg を <img src> に書くと CORS / 別ドメインを
 * 意識する必要があるため Next.js 側で bridge する。Cache-Control はそのまま転送
 */
export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  /**
   * 不正な username は API 側のバリデーションでも 200 + BadRequest SVG が返るので
   * ここでは早期 return せずそのまま転送する
   */
  const upstream = await fetch(`${env.API_URL}/badge/${encodeURIComponent(username)}.svg`)
  const body = await upstream.text()
  return new NextResponse(body, {
    headers: {
      "Cache-Control": upstream.headers.get("cache-control") ?? "public, max-age=300, stale-while-revalidate=600",
      "Content-Type": "image/svg+xml",
    },
    status: 200,
  })
}
