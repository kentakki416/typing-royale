import Script from "next/script"

/**
 * AdSense の共通 JS ローダー。
 *
 * `NEXT_PUBLIC_ADSENSE_CLIENT` が未設定（審査前 / アカウント未取得）の場合は
 * 何もレンダリングしない。設定後は全ページの <head> 相当で 1 度だけ読み込む。
 *
 * `strategy="afterInteractive"` で初期描画をブロックせず、LCP への影響を抑える。
 */
const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? ""

export function AdSenseScript() {
  if (ADSENSE_CLIENT.length === 0) {
    return null
  }

  return (
    <Script
      async
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
      strategy="afterInteractive"
    />
  )
}
