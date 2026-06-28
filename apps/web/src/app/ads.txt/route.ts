/**
 * GET /ads.txt
 *
 * AdSense は配信前に `https://typing-royale.com/ads.txt` で
 * 「この広告枠を販売してよいのは誰か」を宣言することを要求する。
 *
 * パブリッシャー ID（NEXT_PUBLIC_ADSENSE_CLIENT_ID）から動的に生成するため、
 * アカウント取得後に環境変数を設定するだけで有効になる（ハードコード不要）。
 * 未設定時は 404 を返す（審査前は ads.txt を露出しない）。
 *
 * 形式: `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`
 * 末尾の `f08c47fec0942fa0` は Google の固定 certification authority ID。
 */
const GOOGLE_CERTIFICATION_AUTHORITY_ID = "f08c47fec0942fa0"

export function GET() {
  const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID ?? ""

  if (adsenseClient.length === 0) {
    return new Response("ads.txt is not configured yet", { status: 404 })
  }

  /**
   * NEXT_PUBLIC_ADSENSE_CLIENT_ID は "ca-pub-..." 形式。
   * ads.txt では "pub-..." 形式を使うため "ca-" prefix を除去する。
   */
  const publisherId = adsenseClient.replace(/^ca-/, "")
  const body = `google.com, ${publisherId}, DIRECT, ${GOOGLE_CERTIFICATION_AUTHORITY_ID}\n`

  return new Response(body, {
    headers: {
      "cache-control": "public, max-age=86400",
      "content-type": "text/plain; charset=utf-8",
    },
  })
}
