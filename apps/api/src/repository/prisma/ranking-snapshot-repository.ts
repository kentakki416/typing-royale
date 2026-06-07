/**
 * 言語別オールタイムトップエントリ
 */
export type RankingTopEntry = {
    bestPlaySessionId: number
    bestScore: number
    userDisplay: {
        avatarUrl: string | null
        currentGrade: string
        displayName: string
    }
    userId: number
}

/**
 * RankingSnapshot リポジトリのインターフェース
 *
 * 言語別オールタイムトップ N を返す read-only Repository。
 * 本物の実装は score-ranking 機能（Phase 4）で `ranking_snapshots` テーブル
 * から取得する形になる。本 step（step6 / challenge-gods）では interface だけ
 * 先に定義し、`StubRankingSnapshotRepository` で常に空配列を返す
 */
export interface RankingSnapshotRepository {
    /**
     * 言語別オールタイムトップ N を返す（score 降順）
     * MVP では N=10
     */
    getTopByLanguage(languageId: number, limit: number): Promise<RankingTopEntry[]>
}

/**
 * score-ranking 機能完成までの暫定スタブ
 *
 * 常に空配列を返すので、`/challenge-gods` は HTTP 409 Conflict を返す。
 * Web 側で「神々に挑戦」ボタンを disabled にする運用
 */
export class StubRankingSnapshotRepository implements RankingSnapshotRepository {
  async getTopByLanguage(): Promise<RankingTopEntry[]> {
    return []
  }
}
