"use client"

import { useEffect } from "react"

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID ?? ""

type AdUnitProps = {
  /**
   * AdSense の広告フォーマット（既定 "auto" でレスポンシブ）
   */
  format?: string

  /**
   * レイアウト確保用の最小高さ（px）。CLS（レイアウトシフト）対策で予約する。
   */
  minHeight?: number

  /**
   * AdSense 管理画面で発行する広告ユニットのスロット ID
   */
  slot: string
}

/**
 * AdSense ディスプレイ広告ユニット 1 枠。
 *
 * `NEXT_PUBLIC_ADSENSE_CLIENT_ID` 未設定時は何も描画しないため、
 * 各ページに先行して埋め込んでおいても審査前は表示されない。
 *
 * 配置方針は [`docs/spec/adsense/README.md`](../../../../../docs/spec/adsense/README.md) を参照。
 * プレイ中（/play・ゴースト対戦）には設置しない。
 */
export function AdUnit({ format = "auto", minHeight = 100, slot }: AdUnitProps) {
  useEffect(() => {
    if (ADSENSE_CLIENT.length === 0) {
      return
    }
    try {
      ;(window.adsbygoogle = window.adsbygoogle ?? []).push({})
    } catch {
      /**
       * 二重 push やスクリプト未ロード時の例外は無視する（描画は AdSense JS 側で行われる）
       */
    }
  }, [])

  if (ADSENSE_CLIENT.length === 0) {
    return null
  }

  return (
    <ins
      className="adsbygoogle"
      data-ad-client={ADSENSE_CLIENT}
      data-ad-format={format}
      data-ad-slot={slot}
      data-full-width-responsive="true"
      style={{ display: "block", minHeight }}
    />
  )
}
