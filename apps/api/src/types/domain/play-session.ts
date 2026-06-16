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
 *
 * 認証必須エンドポイント (`/api/play-sessions/solo` 等) でのみ使う。
 * ゲストプレイは Redis を使わず `/api/play-sessions/guest/*` のステートレス経路で処理する。
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

/**
 * キーストロークログの 1 エントリ
 * 仕様の正本は docs/spec/ghost-battle/README.md「キーストロークログのデータ構造」
 */
export type KeystrokeEntry = {
    /**
     * セッション開始からの経過ミリ秒（performance.now() 起点）
     */
    elapsedMs: number
    /**
     * 実際に入力された文字（または "Enter" / "Backspace" 等の特殊キー名）
     */
    inputChar: string
    /**
     * その時点で期待されていた正解文字と一致したか
     */
    isCorrect: boolean
    /**
     * 何問目を打っていたか（0..19 の orderIndex）
     */
    problemIndex: number
}

export type KeystrokeLogs = KeystrokeEntry[]

/**
 * ニガテ文字集計（key=正解期待文字、value=誤打鍵回数）
 */
export type MistypeStats = Record<string, number>

/**
 * /finish のレスポンスに含むグレード（score-ranking step3 で追加）
 * lib/grade.ts の Grade 型と同じ shape だが、循環参照を避けるため domain 側にも定義する
 */
export type FinishGrade = {
    level: number
    name: string
    slug: string
}

/**
 * /finish のサーバー集計結果（クライアント送信値を再計算したもの）
 */
export type FinishResult = {
    /** 既存 */
    accuracy: number
    mistypeStats: MistypeStats
    persisted: boolean
    problemsCompleted: number
    problemsPlayed: number
    score: number
    typedChars: number

    /** score-ranking step3 で追加 */
    bestScoreUpdated: boolean
    gradeUp: { from: FinishGrade; to: FinishGrade } | null
    newRank: number | null
    topTenBoundaryScore: number | null
    /**
     * 当該言語のランクイン総人数。リザルト画面「Y 人中」表示用。
     * /finish 内で同じ Redis/Prisma レイヤから取得して、別 fetch を不要にする
     */
    totalRankedPlayers: number
}
