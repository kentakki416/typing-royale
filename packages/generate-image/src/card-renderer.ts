import { Resvg } from "@resvg/resvg-js"
import satori from "satori"

import { logger } from "@repo/logger"

import { EMOJI_DATA_URI_BY_CODEPOINT } from "./emoji-assets"
import { languageDisplayName } from "./language-label"
import type { RewardLanguage } from "./types"

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

/**
 * satori はデフォルトで絵文字フォントを持たないため、👑 / 🏆 等がそのままだと
 * 豆腐 (□) になる。`loadAdditionalAsset` で同梱した twemoji の SVG (data URI) を返し
 * <img> として描画する。CDN 依存を避けてインフラコスト/障害点を増やさないため、
 * 画像は `emoji-assets.ts` にビルド時同梱する（fetch しない）。
 * 未登録の絵文字は空文字を返し、絵文字なしで描画を継続する（カード生成自体は失敗させない）。
 */
const convertEmojiToCodepoint = (emoji: string): string =>
  [...emoji]
    .map((ch) => ch.codePointAt(0)?.toString(16) ?? "")
    /** twemoji のファイル名は variation selector (FE0F) を含まない */
    .filter((hex) => hex !== "" && hex !== "fe0f")
    .join("-")

const getEmojiDataUri = (segment: string): string =>
  EMOJI_DATA_URI_BY_CODEPOINT[convertEmojiToCodepoint(segment)] ?? ""

/**
 * 全カード共通の satori オプション（フォント + 絵文字ローダ + カードサイズ）
 */
const buildSatoriOptions = (font: ArrayBuffer) => ({
  fonts: [{ data: font, name: "NotoSansJP", style: "normal" as const, weight: 700 as const }],
  height: CARD_HEIGHT,
  loadAdditionalAsset: async (code: string, segment: string): Promise<string> =>
    Promise.resolve(code === "emoji" ? getEmojiDataUri(segment) : ""),
  width: CARD_WIDTH,
})

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
          backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 38%), linear-gradient(100deg, rgba(255,255,255,0) 40%, rgba(255,255,255,0.13) 50%, rgba(255,255,255,0) 60%), linear-gradient(180deg, ${gradient.from} 0%, ${gradient.to} 100%)`,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          padding: 64,
          width: "100%",
        },
      },
    } as never,
    buildSatoriOptions(font),
  )

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: CARD_WIDTH } })
  const png = resvg.render().asPng()
  return Buffer.from(png)
}

/**
 * Hall of Fame 達成カードの順位別テーマ
 *
 * 1 = 金、2 = 銀、3 = 銅、4-10 = 黒メイン。docs/spec/special-badges/README.md
 * 「配色ルール」参照
 */
const HOF_THEMES = {
  1: { accent: "#fff7d6", emoji: "👑", from: "#ffd54a", to: "#8a5a0a" },
  2: { accent: "#f9fafb", emoji: "🥈", from: "#e5e7eb", to: "#374151" },
  3: { accent: "#fcd9b6", emoji: "🥉", from: "#d97706", to: "#78350f" },
  rest: { accent: "#cbd5e1", emoji: "💎", from: "#1f2937", to: "#030712" },
} as const

const getHofTheme = (rank: number) => {
  if (rank === 1) return HOF_THEMES[1]
  if (rank === 2) return HOF_THEMES[2]
  if (rank === 3) return HOF_THEMES[3]
  return HOF_THEMES.rest
}

export type RenderHallOfFameCardInput = {
    language: RewardLanguage
    rank: number
    username: string
}

/**
 * Hall of Fame 達成カードを PNG として生成（1200×630、order rank 1-3 は金/銀/銅、
 * 4-10 は黒メイン）
 */
export const renderHallOfFameCard = async (input: RenderHallOfFameCardInput): Promise<Buffer> => {
  const font = await loadFont()
  const theme = getHofTheme(input.rank)

  logger.debug("card-renderer: rendering hall of fame card", {
    rank: input.rank,
    user: input.username,
  })

  const svg = await satori(
    {
      type: "div",
      props: {
        children: [
          {
            type: "div",
            props: {
              children: `${theme.emoji} HALL OF FAME`,
              style: {
                color: "#fff",
                fontSize: 36,
                fontWeight: 700,
                letterSpacing: 4,
                opacity: 0.95,
                textShadow: `0 0 24px ${theme.accent}`,
              },
            },
          },
          {
            type: "div",
            props: {
              children: `RANK #${input.rank}`,
              style: {
                color: "#fff",
                fontSize: 180,
                fontWeight: 900,
                lineHeight: 1.1,
                marginTop: 24,
                textShadow: `0 6px 32px rgba(0,0,0,0.45), 0 0 28px ${theme.accent}`,
              },
            },
          },
          {
            type: "div",
            props: {
              children: `@${input.username}`,
              style: {
                color: "#fff",
                fontSize: 44,
                fontWeight: 700,
                marginTop: 24,
                opacity: 0.97,
              },
            },
          },
          {
            type: "div",
            props: {
              children: languageDisplayName(input.language),
              style: {
                border: "1.5px solid rgba(255,255,255,0.5)",
                borderRadius: 23,
                color: "#fff",
                fontSize: 22,
                fontWeight: 700,
                marginTop: 16,
                opacity: 0.92,
                padding: "8px 28px",
              },
            },
          },
          {
            type: "div",
            props: {
              children: "Typing Royale",
              style: {
                color: "#fff",
                fontSize: 22,
                marginTop: 40,
                opacity: 0.75,
              },
            },
          },
        ],
        style: {
          alignItems: "center",
          backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 38%), linear-gradient(100deg, rgba(255,255,255,0) 40%, rgba(255,255,255,0.13) 50%, rgba(255,255,255,0) 60%), linear-gradient(180deg, ${theme.from} 0%, ${theme.to} 100%)`,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          padding: 64,
          width: "100%",
        },
      },
    } as never,
    buildSatoriOptions(font),
  )

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: CARD_WIDTH } })
  return Buffer.from(resvg.render().asPng())
}

const MONTHLY_THEME = { accent: "#e0f2fe", from: "#7dd3fc", to: "#0c4a6e" }

export type RenderMonthlyTopTenCardInput = {
    language: RewardLanguage
    rank: number
    username: string
    yearMonth: string
}

/**
 * 月間 TOP 10 達成カードを PNG として生成（1200×630、青固定）。yearMonth は
 * "YYYY-MM" 形式で受け取り、表示は "YYYY.MM"
 */
export const renderMonthlyTopTenCard = async (input: RenderMonthlyTopTenCardInput): Promise<Buffer> => {
  const font = await loadFont()
  const theme = MONTHLY_THEME
  const yearMonthLabel = input.yearMonth.replace("-", ".")

  logger.debug("card-renderer: rendering monthly top ten card", {
    rank: input.rank,
    user: input.username,
    yearMonth: input.yearMonth,
  })

  const svg = await satori(
    {
      type: "div",
      props: {
        children: [
          {
            type: "div",
            props: {
              children: "🏆 MONTHLY TOP 10",
              style: {
                color: "#fff",
                fontSize: 36,
                fontWeight: 700,
                letterSpacing: 4,
                opacity: 0.95,
                textShadow: `0 0 22px ${theme.accent}`,
              },
            },
          },
          {
            type: "div",
            props: {
              children: yearMonthLabel,
              style: {
                color: "#fff",
                fontSize: 64,
                fontWeight: 700,
                letterSpacing: 4,
                marginTop: 16,
                opacity: 0.94,
                textShadow: `0 0 18px ${theme.accent}`,
              },
            },
          },
          {
            type: "div",
            props: {
              children: `RANK #${input.rank}`,
              style: {
                color: "#fff",
                fontSize: 160,
                fontWeight: 900,
                lineHeight: 1.1,
                marginTop: 16,
                textShadow: `0 6px 32px rgba(0,0,0,0.5), 0 0 28px ${theme.accent}`,
              },
            },
          },
          {
            type: "div",
            props: {
              children: `@${input.username}`,
              style: {
                color: "#fff",
                fontSize: 40,
                fontWeight: 700,
                marginTop: 24,
                opacity: 0.97,
              },
            },
          },
          {
            type: "div",
            props: {
              children: languageDisplayName(input.language),
              style: {
                border: "1.5px solid rgba(255,255,255,0.5)",
                borderRadius: 22,
                color: "#fff",
                fontSize: 22,
                fontWeight: 700,
                marginTop: 12,
                opacity: 0.92,
                padding: "8px 28px",
              },
            },
          },
          {
            type: "div",
            props: {
              children: "Typing Royale",
              style: {
                color: "#fff",
                fontSize: 20,
                marginTop: 36,
                opacity: 0.75,
              },
            },
          },
        ],
        style: {
          alignItems: "center",
          backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 38%), linear-gradient(100deg, rgba(255,255,255,0) 40%, rgba(255,255,255,0.13) 50%, rgba(255,255,255,0) 60%), linear-gradient(180deg, ${theme.from} 0%, ${theme.to} 100%)`,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          padding: 64,
          width: "100%",
        },
      },
    } as never,
    buildSatoriOptions(font),
  )

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: CARD_WIDTH } })
  return Buffer.from(resvg.render().asPng())
}
