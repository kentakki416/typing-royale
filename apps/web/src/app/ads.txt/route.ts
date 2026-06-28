/**
 * GET /ads.txt
 *
 * Google のクローラが取得する text/plain ファイル。広告枠の正規の販売者を宣言する。
 * 1 行 = カンマ区切り 4 フィールド（IAB ads.txt 仕様）:
 *   1. 広告システムのドメイン … AdSense は `google.com`
 *   2. パブリッシャー ID … `pub-XXXXXXXXXXXXXXXX`（env の `ca-` を除いた値）
 *   3. 取引関係 … 枠を直接所有するので `DIRECT`（再販なら RESELLER）
 *   4. 認証局 ID … Google 固定の `f08c47fec0942fa0`
 * 出力例: `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`
 *
 * 値は NEXT_PUBLIC_ADSENSE_CLIENT_ID から動的生成する（ハードコード不要）。
 * 未設定時は 404（審査前は露出しない）。
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
