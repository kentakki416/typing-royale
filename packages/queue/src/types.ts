/**
 * Queue 抽象層の型定義
 *
 * このファイルは具体的な Queue 実装 (BullMQ / SQS / Cloud Tasks / pg-boss など) に
 * 依存しない。ジョブハンドラはこの型だけを knows し、Queue 実装を直接 import しないこと。
 * 別の Queue 実装に乗り換えるときは、`JobQueue<T>` / `JobConsumer` を実装した別クラス /
 * 別関数を用意し、`src/index.ts` から export して app 側の生成箇所だけ差し替える。
 *
 * 設計詳細: docs/spec/rewards-worker/step1-packages-queue-and-generate-image.md
 */

/**
 * Worker が受け取るジョブメッセージ。Queue 実装に依存しない最小情報のみを持つ。
 *
 * - `id`: 重複排除キーやログ追跡用のジョブ識別子
 * - `data`: アプリケーション固有のペイロード
 * - `attemptsMade`: 既に試行された回数（0 オリジン。リトライ時に 1 以上になる）
 */
export type JobMessage<T> = {
    attemptsMade: number
    data: T
    id: string
}

/**
 * ジョブを処理する関数の型。
 *
 * 実装は冪等であること（ジョブは中断 / リトライにより複数回実行されうる）。
 * throw した場合は Queue 側のリトライポリシーに従って再試行される。
 */
export type JobProcessor<T> = (message: JobMessage<T>) => Promise<void>

/**
 * Enqueue 時のオプション。Queue 実装によっては一部が無視される (best-effort)。
 *
 * - `jobId`: 同じ jobId のジョブを重複 enqueue した場合、実装側でデデュープされることを期待する
 * - `delayMs`: 指定ミリ秒後にジョブを実行する
 */
export type EnqueueOptions = {
    delayMs?: number
    jobId?: string
}

/**
 * Producer 側 (api / cron など) が使う Queue インタフェース。
 *
 * ジョブを enqueue するだけの最小 API。実装は BullMQ / SQS / Cloud Tasks など何でも良い。
 */
export interface JobQueue<T> {
    close(): Promise<void>
    enqueue(data: T, options?: EnqueueOptions): Promise<void>
}

/**
 * 最終失敗 (リトライ上限到達) コールバックに渡される情報。
 *
 * `generation_status="failed"` を書き込む等、業務側の終端処理を呼ぶために使う。
 */
export type FinalFailureInfo<T> = {
    data: T
    failedReason: string
    id: string
}

/**
 * Worker 起動オプション。
 */
export type StartWorkerOptions<T> = {
    /** 同時並行ジョブ数。デフォルト 1 */
    concurrency?: number
    /**
     * リトライ上限に到達して最終失敗した時に呼ばれるコールバック。
     * 例: rewards.generation_status="failed" を UPDATE する用途。
     * この callback 自体が throw しても in-flight ジョブの状態には影響しない (warn ログのみ)
     */
    onFinalFailure?: (info: FinalFailureInfo<T>) => Promise<void>
    processor: JobProcessor<T>
    queueName: string
}

/**
 * Worker のハンドル。graceful shutdown でジョブ取得を停止し、in-flight ジョブの
 * 完了を待ってから resolve する。
 */
export interface JobConsumer {
    close(): Promise<void>
}
