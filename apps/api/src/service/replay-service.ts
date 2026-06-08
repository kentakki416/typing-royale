import { err, notFoundError, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"

import type { KeystrokeLogRepository } from "../repository/prisma/keystroke-log-repository"
import type { FeaturedReplayRow, ReplayRepository, ReplaySource } from "../repository/prisma/replay-repository"
import type { KeystrokeLogs } from "../types/domain"

type GetReplayInput = {
    playSessionId: number
}

type GetReplayOutput = {
    keystrokeLogs: KeystrokeLogs
    source: ReplaySource
}

/**
 * リプレイ取得
 *
 * 1. play_sessions + 関連テーブルを取得（不在 → 404）
 * 2. canPublicRanking=false なら閲覧対象外（404）
 * 3. keystroke_logs を別途取得（不在 → 404）
 */
export const getReplay = async (
  input: GetReplayInput,
  repo: {
        keystrokeLogRepository: KeystrokeLogRepository
        replayRepository: ReplayRepository
    },
): Promise<Result<GetReplayOutput>> => {
  logger.debug("ReplayService: getReplay", { ...input })

  const source = await repo.replayRepository.findById(input.playSessionId)
  if (source === null) {
    return err(notFoundError("Replay not found"))
  }
  if (!source.user.canPublicRanking) {
    return err(notFoundError("Replay not found"))
  }
  const keystrokeLogs = await repo.keystrokeLogRepository.findByPlaySessionId(input.playSessionId)
  if (keystrokeLogs === null) {
    return err(notFoundError("Replay not found"))
  }

  return ok({ keystrokeLogs, source })
}

type ListFeaturedInput = {
    language?: string
    limit: number
}

/**
 * 注目リプレイ一覧
 *
 * `hall_of_fame_entries` のコメント付きエントリを `commentSubmittedAt DESC` で limit 件返す。
 * 空配列でも 200 を返したいため Result でなく素の Promise を返す
 */
export const listFeatured = async (
  input: ListFeaturedInput,
  repo: { replayRepository: ReplayRepository },
): Promise<FeaturedReplayRow[]> => {
  logger.debug("ReplayService: listFeatured", { ...input })
  return repo.replayRepository.findFeatured(input)
}
