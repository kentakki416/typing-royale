/**
 * プレイセッションのモード
 * step2 では "solo" のみ。"challenge_gods" は step6 で追加
 */
export type PlaySessionMode = "solo" | "challenge_gods"

/**
 * Redis に揮発保持するセッションステート
 *
 * `/solo` で作成し、`/finish` で読み出して DB に書き込んだ後に削除する
 * TTL 切れで自然消滅したセッションはクリーンアップ不要
 */
export type PlaySessionState = {
    crawledRepoId: number
    ghostSessionId: number | null
    languageId: number
    mode: PlaySessionMode
    /**
     * 抽選した 20 問の Problem.id を出題順に並べた配列
     * インデックス = orderIndex（0..19）
     */
    problemIds: number[]
    userId: number
}

/**
 * クライアントに返す問題 1 件
 */
export type PlaySessionProblem = {
    id: number
    charCount: number
    codeBlock: string
    functionName: string
    lineCount: number
    orderIndex: number
    sourceUrl: string
}

/**
 * クライアントに返す repo メタ情報
 */
export type RepoInfo = {
    description: string | null
    homepage: string | null
    name: string
    owner: string
    stars: number
    topics: string[]
}
