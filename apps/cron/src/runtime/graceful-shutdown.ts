import { logger } from "@repo/logger"

export type ShutdownHandle = {
  /**
   * 長時間処理から協調的に中断するための AbortSignal。
   * task のループや service の途中で `signal.aborted` を確認すること。
   */
  signal: AbortSignal
  /**
   * shutdown が開始されたかを返す。`signal.aborted` と同値だが、
   * 既存 task との互換のためにフラグ参照のショートカットとしても提供する。
   */
  isShuttingDown: () => boolean
  /**
   * shutdown を引き起こしたシグナル。受信前は null。
   * main の catch 側でプロセス終了コードを決めるのに使う。
   */
  signalReceived: () => NodeJS.Signals | null
}

/**
 * SIGTERM (ECS Scheduled Task) / SIGINT (Ctrl-C) を受けたときに
 * AbortController を abort してフラグを立てるだけの軽量 graceful shutdown。
 *
 * **シグナルハンドラ内で Prisma を disconnect しない**。disconnect は呼び出し側
 * (`runAsCrawlerJob` 等の runtime) の finally で 1 度だけ行うことで、disconnect の
 * 二重実行と「main の finally がシグナル受信前に走り切るまでに片付かないまま
 * process.exit が呼ばれる」レースを回避する。
 *
 * task 側はループや長い処理の境界で `signal.aborted` を確認し、協調的に
 * 中断する。シグナル受信後、シャットダウンが完了する前に SIGKILL が来る
 * ケースは ECS のタスク停止猶予に任せる（通常 30 秒）。
 */
export const setupGracefulShutdown = (): ShutdownHandle => {
  const controller = new AbortController()
  let shuttingDown = false
  let received: NodeJS.Signals | null = null

  const onSignal = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return
    shuttingDown = true
    received = signal
    logger.warn("shutdown initiated", { signal })
    controller.abort()
  }

  process.on("SIGTERM", onSignal)
  process.on("SIGINT", onSignal)

  return {
    isShuttingDown: () => shuttingDown,
    signal: controller.signal,
    signalReceived: () => received,
  }
}
