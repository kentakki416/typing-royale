/**
 * 特典 (Reward) のドメイン型
 *
 * grade_up はグレードアップ達成カード、hall_of_fame_in は殿堂入りバッジ、
 * monthly_top_ten は月間 TOP 10 バッジを表す。詳細は
 * docs/spec/special-badges/README.md を参照。
 */
export type RewardType = "grade_up" | "hall_of_fame_in" | "monthly_top_ten"

/**
 * reward の対象言語 slug（例: "javascript" / "typescript" / "go"）。
 *
 * reward は言語マスタ (languages テーブル) 駆動で汎用化されており、特定の言語に
 * 限定しない。新しい言語がマスタに追加されればコード変更なしで reward 対象になる。
 */
export type RewardLanguage = string

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

/**
 * 画像生成ステータス。rewards-worker (step3) で apps/worker が遷移を管理する。
 * - pending: INSERT 直後
 * - processing: worker が generateReward 実行中
 * - completed: SVG/PNG 生成 + storage save 成功
 * - failed: BullMQ attempts=3 を超えた最終失敗 (UI には表示しない)
 */
export type RewardGenerationStatus = "completed" | "failed" | "pending" | "processing"

export type Reward = {
    id: number
    userId: number
    type: RewardType
    payload: RewardPayload
    assetUrl: string | null
    assetSvgUrl: string | null
    generationStatus: RewardGenerationStatus
    grantedAt: Date
    createdAt: Date
    updatedAt: Date
}
