/**
 * 特典 (Reward) のドメイン型
 *
 * grade_up はグレードアップ達成カード、hall_of_fame_in は殿堂入りバッジ、
 * monthly_top_ten は月間 TOP 10 バッジを表す。詳細は
 * docs/spec/special-badges/README.md を参照。
 */
export type RewardType = "grade_up" | "hall_of_fame_in" | "monthly_top_ten"

export type RewardLanguage = "javascript" | "typescript"

export type GradeUpPayload = {
    grade_slug: string
}

export type HallOfFameInPayload = {
    language: RewardLanguage
    rank: number
}

export type MonthlyTopTenPayload = {
    language: RewardLanguage
    rank: number
    year_month: string /** "YYYY-MM" 形式 (例: "2026-06") */
}

export type RewardPayload = GradeUpPayload | HallOfFameInPayload | MonthlyTopTenPayload

export type Reward = {
    id: number
    userId: number
    type: RewardType
    payload: RewardPayload
    assetUrl: string | null
    assetSvgUrl: string | null
    grantedAt: Date
    createdAt: Date
    updatedAt: Date
}
