/**
 * 「ユーザーに既に見せた reward の id」を localStorage で管理する共通ストア。
 *
 * `PendingRewardsPopup`（リザルト直後）と `MissedRewardsPopup`（取りこぼし救済）が
 * 同じ reward を二重にポップアップしないよう、両者がこのストアを共有する。
 * Pending が表示を担当した reward は seen に記録し、Missed 側はそれをスキップする。
 */

const STORAGE_KEY = "seen-reward-ids"
/** localStorage を膨張させないため直近 N 件だけ保持 */
const MAX_SEEN_IDS = 100

export const readSeenRewardIds = (): Set<number> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((n): n is number => typeof n === "number"))
  } catch {
    return new Set()
  }
}

export const markRewardsSeen = (rewardIds: number[]): void => {
  const ids = readSeenRewardIds()
  for (const id of rewardIds) ids.add(id)
  const list = Array.from(ids).slice(-MAX_SEEN_IDS)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /** localStorage が使えない環境では諦める（dedup は best-effort） */
  }
}
