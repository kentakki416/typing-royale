import { NextRequest, NextResponse } from "next/server"

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/libs/auth"

/**
 * production 以外でのみ公開する dev 専用パス
 * `/dev/login?as=alice` を踏むだけでログイン状態にできる開発支援機能
 */
const DEV_ONLY_PUBLIC_PATHS = process.env.NODE_ENV !== "production"
  ? ["/dev/login"]
  : []

const PUBLIC_PATHS = [
  "/sign-in",
  "/api/auth/callback/github",
  "/api/auth/callback/google",
  /**
   * score-ranking の公開画面: 未ログインでも閲覧可能
   * step5 では /ranking を追加し忘れていたため、本 step (step7) で /players と同時に追加
   */
  "/ranking",
  "/players",
  /**
   * replay-viewer: 個別リプレイページは未ログインでも閲覧可能
   */
  "/replay",
  /**
   * rewards: Hall of Fame は公開ページ
   */
  "/hall-of-fame",
  /**
   * ゲストプレイ: 言語選択 (/play) とプレイ画面 (/play/[sessionId]) は未ログインでもアクセス可能。
   * API 側もゲスト対応済みで、/finish は DB 書き込みをスキップしてスコアだけ返す。
   */
  "/play",
  ...DEV_ONLY_PUBLIC_PATHS,
]

/**
 * 完全一致でしか public にできないパス。
 * PUBLIC_PATHS は startsWith 判定なので "/" を入れると全パスが通ってしまうため分離する。
 */
const PUBLIC_EXACT_PATHS = [
  /**
   * ゲストプレイ: トップページ
   */
  "/",
]

/**
 * Edge ランタイムで動くため JWT 検証は行わず、Cookie の有無だけで判断する
 * （実検証は API 側で行う）
 *
 * hasRefresh だけでも入場を許可する理由:
 * Server Component 側で apiClient が 401 → refresh → 再試行する設計のため、
 * access が切れている状態で proxy で蹴ると refresh の機会が失われる。
 */
export const proxy = (req: NextRequest) => {
  const { pathname } = req.nextUrl

  if (PUBLIC_EXACT_PATHS.includes(pathname) || PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const hasAccess = req.cookies.has(ACCESS_TOKEN_COOKIE)
  const hasRefresh = req.cookies.has(REFRESH_TOKEN_COOKIE)

  if (!hasAccess && !hasRefresh) {
    const url = new URL("/sign-in", req.url)
    url.searchParams.set("redirect", pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  /** _next, _next/static, _next/image, favicon, public 配下を除外 */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
}
