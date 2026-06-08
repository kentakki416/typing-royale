type Slug = "gold" | "silver" | "bronze"

type Props = {
  slug: Slug
  /**
   * SVG 内で使う ID プレフィックス。同一ページに複数の王冠を置くとき
   * defs の id 衝突を防ぐために呼び出し側でユニーク化する
   */
  scope: string
  /**
   * "card" (hof-card 用の小さい王冠) / "modal" (god-modal 用の大きい王冠)
   * いずれも同じ SVG だが、modal は揺れアニメの振り幅を強めにする
   */
  variant?: "card" | "modal"
}

/**
 * Hall of Fame 用の SVG 王冠
 *
 * 立体感を 4 層で表現:
 * 1. drop-shadow filter で全体に影
 * 2. 王冠本体 = linearGradient 5 stop (光沢の艶)
 * 3. 王冠の上部に白 highlight overlay path
 * 4. 帯と宝玉も同じグラデパターン + 宝玉は radialGradient + 左上 spot
 *
 * 中央赤宝石は palette に依らず常に赤系。
 * animateTransform で穏やかな bob 回転 (card は ±3 度、modal は ±4 度)
 */
export function CrownSvg({ slug, scope, variant = "card" }: Props) {
  const palette = PALETTES[slug]
  const id = (k: string) => `${scope}-${k}`
  const rockAmplitude = variant === "modal" ? 4 : 3

  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 56 40"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={id("metal")} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="20%" stopColor={palette.light} />
          <stop offset="55%" stopColor={palette.main} />
          <stop offset="85%" stopColor={palette.deep} />
          <stop offset="100%" stopColor={palette.shadow} />
        </linearGradient>
        <radialGradient id={id("gem")} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor={palette.light} />
          <stop offset="70%" stopColor={palette.main} />
          <stop offset="100%" stopColor={palette.deep} />
        </radialGradient>
        <radialGradient id={id("ruby")} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffe0e0" />
          <stop offset="40%" stopColor="#e64545" />
          <stop offset="100%" stopColor="#5a1010" />
        </radialGradient>
        <linearGradient id={id("band")} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="30%" stopColor={palette.light} />
          <stop offset="70%" stopColor={palette.main} />
          <stop offset="100%" stopColor={palette.deep} />
        </linearGradient>
        <filter
          filterUnits="userSpaceOnUse"
          height="60"
          id={id("shadow")}
          width="76"
          x="-10"
          y="-10"
        >
          <feDropShadow
            dx="0"
            dy="1.5"
            floodColor="#000"
            floodOpacity="0.55"
            stdDeviation="1.2"
          />
        </filter>
      </defs>

      <g filter={`url(#${id("shadow")})`}>
        <animateTransform
          attributeName="transform"
          dur="3.4s"
          repeatCount="indefinite"
          type="rotate"
          values={`${-rockAmplitude} 28 20; ${rockAmplitude} 28 20; ${-rockAmplitude} 28 20`}
        />
        {/* 王冠本体 */}
        <path
          d="M2 14 L10 30 L18 16 L28 4 L38 16 L46 30 L54 14 L52 36 L4 36 Z"
          fill={`url(#${id("metal")})`}
          stroke={palette.stroke}
          strokeLinejoin="round"
          strokeWidth="1.2"
        />
        {/* 上部に白 highlight overlay (左半分のみ細く) */}
        <path
          d="M3 15 L10.5 27 L18 17 L28 6 L27 9 L18 19 L11 27 L4 16 Z"
          fill="#ffffff"
          opacity="0.45"
        />
        {/* 帯 */}
        <rect
          fill={`url(#${id("band")})`}
          height="6"
          rx="1.5"
          stroke={palette.stroke}
          strokeWidth="1.2"
          width="48"
          x="4"
          y="33"
        />
        {/* 帯の上端 highlight 線 */}
        <line
          stroke="#ffffff"
          strokeOpacity="0.7"
          strokeWidth="0.6"
          x1="6"
          x2="50"
          y1="34"
          y2="34"
        />
        {/* 3 つの宝玉 */}
        <circle
          cx="2"
          cy="14"
          fill={`url(#${id("gem")})`}
          r="3"
          stroke={palette.stroke}
          strokeWidth="0.9"
        />
        <circle
          cx="28"
          cy="4"
          fill={`url(#${id("gem")})`}
          r="3.5"
          stroke={palette.stroke}
          strokeWidth="0.9"
        />
        <circle
          cx="54"
          cy="14"
          fill={`url(#${id("gem")})`}
          r="3"
          stroke={palette.stroke}
          strokeWidth="0.9"
        />
        {/* 各宝玉の左上 spot (球体感) */}
        <ellipse cx="1.2" cy="13.2" fill="#ffffff" opacity="0.85" rx="0.7" ry="0.5" />
        <ellipse cx="27" cy="3" fill="#ffffff" opacity="0.85" rx="0.9" ry="0.6" />
        <ellipse cx="53.2" cy="13.2" fill="#ffffff" opacity="0.85" rx="0.7" ry="0.5" />
        {/* 中央赤宝石 */}
        <circle
          cx="28"
          cy="24"
          fill={`url(#${id("ruby")})`}
          r="2.8"
          stroke={palette.stroke}
          strokeWidth="0.7"
        />
        <ellipse cx="27" cy="23" fill="#ffffff" opacity="0.75" rx="0.7" ry="0.4" />
      </g>
    </svg>
  )
}

/**
 * 各 rank のパレット (light / main / deep / shadow / stroke)
 */
const PALETTES: Record<Slug, {
  light: string
  main: string
  deep: string
  shadow: string
  stroke: string
}> = {
  bronze: {
    deep: "#74462a",
    light: "#f5d6b8",
    main: "#cd7f32",
    shadow: "#3d2410",
    stroke: "#3d2a18",
  },
  gold: {
    deep: "#b8860b",
    light: "#fff8d0",
    main: "#ffd54a",
    shadow: "#5a4408",
    stroke: "#5a4408",
  },
  silver: {
    deep: "#8a939e",
    light: "#ffffff",
    main: "#d8dee9",
    shadow: "#4a5260",
    stroke: "#4a5260",
  },
}
