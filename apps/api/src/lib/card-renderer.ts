import { Resvg } from "@resvg/resvg-js"
import satori from "satori"

import { logger } from "@repo/logger"

/**
 * 達成カード PNG のレンダリング（satori + resvg-js）
 *
 * docs/spec/rewards/step6-api-and-web-achievement-cards.md 参照。OG カードと
 * 同サイズ 1200×630 で生成し、X / Slack / Facebook 等のシェアで切り取られず
 * 綺麗に表示される
 */

const CARD_WIDTH = 1200
const CARD_HEIGHT = 630

/**
 * satori はフォントを必須にする。MVP では Google Fonts の Noto Sans JP Bold を
 * 起動時に 1 度だけ fetch してプロセスメモリに保持する。
 *
 * オフライン環境 / ネット遮断時のフォールバックは別 PR
 */
let cachedFont: ArrayBuffer | null = null

const loadFont = async (): Promise<ArrayBuffer> => {
  if (cachedFont !== null) return cachedFont
  const fontUrl = "https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75vY0rw-oME.ttf"
  const res = await fetch(fontUrl)
  if (!res.ok) {
    throw new Error(`Failed to fetch font for card renderer: ${res.status}`)
  }
  cachedFont = await res.arrayBuffer()
  return cachedFont
}

const GRADE_GRADIENTS: Record<string, { from: string; to: string }> = {
  distinguished: { from: "#a02f6e", to: "#561536" },
  fellow: { from: "#ffd54a", to: "#d2992a" },
  intern: { from: "#3a4250", to: "#21262d" },
  junior: { from: "#2c4d6f", to: "#1a2f44" },
  mid: { from: "#1f5c63", to: "#0e3a3f" },
  principal: { from: "#a87a1a", to: "#5a4408" },
  senior: { from: "#1d6638", to: "#0e3f1e" },
  staff: { from: "#5a3d99", to: "#2d1d4e" },
}

export type RenderGradeUpCardInput = {
    achievedAt: Date
    gradeName: string
    gradeSlug: string
    userDisplayName: string
}

/**
 * グレードアップ達成カードを PNG として生成
 */
export const renderGradeUpCard = async (input: RenderGradeUpCardInput): Promise<Buffer> => {
  const font = await loadFont()
  const gradient = GRADE_GRADIENTS[input.gradeSlug] ?? GRADE_GRADIENTS.intern
  const achievedYmd = input.achievedAt.toISOString().slice(0, 10)

  logger.debug("card-renderer: rendering grade up card", {
    grade: input.gradeSlug,
    user: input.userDisplayName,
  })

  const svg = await satori(
    {
      type: "div",
      props: {
        children: [
          {
            type: "div",
            props: {
              children: "🏆 GRADE UP",
              style: {
                color: "#fff",
                fontSize: 36,
                fontWeight: 700,
                letterSpacing: 4,
                opacity: 0.85,
              },
            },
          },
          {
            type: "div",
            props: {
              children: input.gradeName.toUpperCase(),
              style: {
                color: "#fff",
                fontSize: 96,
                fontWeight: 700,
                lineHeight: 1.1,
                marginTop: 24,
                textAlign: "center",
                textShadow: "0 4px 24px rgba(0,0,0,0.45)",
              },
            },
          },
          {
            type: "div",
            props: {
              children: `@${input.userDisplayName}`,
              style: {
                color: "#fff",
                fontSize: 40,
                marginTop: 40,
                opacity: 0.95,
              },
            },
          },
          {
            type: "div",
            props: {
              children: `${achievedYmd} — Typing Royale`,
              style: {
                color: "#fff",
                fontSize: 22,
                marginTop: 16,
                opacity: 0.7,
              },
            },
          },
        ],
        style: {
          alignItems: "center",
          background: `linear-gradient(180deg, ${gradient.from} 0%, ${gradient.to} 100%)`,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          padding: 64,
          width: "100%",
        },
      },
    } as never,
    {
      fonts: [
        {
          data: font,
          name: "NotoSansJP",
          style: "normal",
          weight: 700,
        },
      ],
      height: CARD_HEIGHT,
      width: CARD_WIDTH,
    },
  )

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: CARD_WIDTH } })
  const png = resvg.render().asPng()
  return Buffer.from(png)
}
