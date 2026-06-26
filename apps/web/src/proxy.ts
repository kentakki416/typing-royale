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
  /**
   * ゲストプレイ: トップページ。`matchesPathPrefix` の仕様上、`"/"` を入れると
   * `pathname === "/"` の完全一致のみ通り、`"/foo"` 等は通らない
   */
  "/",
  "/sign-in",
  "/api/auth/callback/github",
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
   * クロール対象リポジトリ一覧は公開ページ。
   * `/api/internal/crawled-repos` はホーム画面 Client Component (`<CrawledReposSection>`)
   * からブラウザ fetch で叩く bridge Route Handler なので、ページ側だけでなく API も
   * 明示的に公開しないと未ログイン時に 307 で /sign-in にリダイレクトされ、
   * fetch が JSON parse 失敗で silent fail → サイドバーが永遠に「読み込み中…」表示になる
   */
  "/crawled-repos",
  "/api/internal/crawled-repos",
  /**
   * ゲストプレイ: 言語選択 (/play) とプレイ画面 (/play/[sessionId]) は未ログインでもアクセス可能。
   * API 側は /api/play-sessions/guest/* （ステートレス）に分離。Server Action がログイン状態を見て叩き分ける
   */
  "/play",
  /**
   * ゲスト用 /finish の proxy Route Handler。/api 配下なので明示的に public 化
   */
  "/api/play-sessions/guest",
  "/debug",
  ...DEV_ONLY_PUBLIC_PATHS,
]

/**
 * 完全一致 or path セグメント境界での prefix 一致をチェックする。
 *
 * 単純な `pathname.startsWith(p)` は `/replay` が `/replay-foo` も通してしまうため、
 * 登録されたページと意図しないパスが衝突するリスクがある。`/` 区切り
 * (= path segment 境界) で一致するもののみ通す。
 *
 * 例 (p = "/replay"):
 * - "/replay"               → true (完全一致)
 * - "/replay/abc-123"       → true (segment 境界の prefix)
 * - "/replay-list"          → false (segment 境界ではない)
 *
 * `p = "/"` のときは `pathname === "/"` のみ true で、ルート完全一致として機能する
 * （`"/foo"` は `startsWith("//")` が false なので除外される）。
 */
const matchesPathPrefix = (pathname: string, p: string): boolean =>
  pathname === p || pathname.startsWith(`${p}/`)

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

  if (PUBLIC_PATHS.some(p => matchesPathPrefix(pathname, p))) {
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
  /**
   * middleware から除外するパス:
   * - `_next/static` / `_next/image` / `favicon.ico` は Next.js が直接配信する内部資産
   * - `.lottie` / `.svg` / `.png` 等の静的アセットは public 配下のファイル。
   *   除外しないと未ログイン時に `/sign-in` リダイレクトが返り、
   *   dotlottie-react などが「Invalid Lottie JSON」エラーを出す
   *
   * Next.js の matcher は静的解析される必要があるため、
   * 拡張子リストはテンプレートリテラルではなくインライン文字列で記述する。
   * 「. を含めば全部スキップ」ではなく拡張子をホワイトリスト指定することで、
   * 将来動的セグメントに `.` を含むパスが来ても middleware を誤バイパスしない
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:lottie|svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf|json)$).*)",
  ],
}
