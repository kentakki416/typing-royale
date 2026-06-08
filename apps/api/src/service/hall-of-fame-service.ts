import { badRequestError, conflictError, err, forbiddenError, notFoundError, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"

import { containsNgWord } from "../lib/ng-word"
import {
  HallOfFameEntryRepository,
  HallOfFameEntryRow,
  LanguageRepository,
  UserLanguageBestRepository,
  UserLanguageBestWithUser,
} from "../repository/prisma"

type ListRepo = {
    hallOfFameEntryRepository: HallOfFameEntryRepository
    languageRepository: LanguageRepository
    userLanguageBestRepository: UserLanguageBestRepository
}

export type ListInput = {
    languageSlug: string
}

export type ListEntry = UserLanguageBestWithUser & {
    rank: number
    entryId: number | null
    comment: string | null
    commentSubmittedAt: Date | null
}

export type ListOutput = {
    entries: ListEntry[]
    language: string
}

/**
 * 言語別 Hall of Fame の取得
 *
 * 1. language slug → id 解決（無ければ 404）
 * 2. user_language_best から TOP 10 を score-ranking step2 流用で取得
 * 3. hall_of_fame_entries から該当 userId 群のコメントを一括取得
 * 4. rank を 1..N で採番しコメントを user_id で JOIN
 */
export const list = async (
  input: ListInput,
  repo: ListRepo,
): Promise<Result<ListOutput>> => {
  logger.debug("HallOfFameService: list", { language: input.languageSlug })

  const language = await repo.languageRepository.findBySlug(input.languageSlug)
  if (!language) return err(notFoundError("Language not found"))

  const top = await repo.userLanguageBestRepository.findTopByLanguage(language.id, 10)
  const userIds = top.map((e) => e.user.id)
  const comments = await repo.hallOfFameEntryRepository.findManyByUserIds(userIds, language.id)
  const byUserId = new Map(comments.map((c) => [c.userId, c]))

  const entries = top.map((e, idx) => {
    const entry = byUserId.get(e.user.id)
    return {
      ...e,
      comment: entry?.comment ?? null,
      commentSubmittedAt: entry?.commentSubmittedAt ?? null,
      entryId: entry?.id ?? null,
      rank: idx + 1,
    }
  })

  return ok({
    entries,
    language: input.languageSlug,
  })
}

type SubmitCommentRepo = {
    hallOfFameEntryRepository: HallOfFameEntryRepository
    languageRepository: LanguageRepository
    userLanguageBestRepository: UserLanguageBestRepository
}

export type SubmitCommentInput = {
    userId: number
    languageSlug: string
    comment: string
}

export type CommentResult = {
    entryId: number
    languageSlug: string
    comment: string
    commentSubmittedAt: Date
}

/**
 * 入賞者本人のコメント送信（即時公開）
 *
 * 順位 1〜10 位以内である必要は無い（リアルタイム集計で表示時に絞る）。
 * 該当言語の user_language_best が無ければ 409
 */
export const submitComment = async (
  input: SubmitCommentInput,
  repo: SubmitCommentRepo,
): Promise<Result<CommentResult>> => {
  logger.debug("HallOfFameService: submitComment", {
    language: input.languageSlug,
    userId: input.userId,
  })

  if (containsNgWord(input.comment)) {
    return err(badRequestError("Comment contains prohibited words"))
  }

  const language = await repo.languageRepository.findBySlug(input.languageSlug)
  if (!language) return err(notFoundError("Language not found"))

  const myBest = await repo.userLanguageBestRepository.findMine(input.userId, language.id)
  if (myBest === null) {
    return err(conflictError("Play first to submit a comment"))
  }

  const row = await repo.hallOfFameEntryRepository.upsertComment({
    bestPlaySessionId: myBest.bestPlaySessionId,
    comment: input.comment,
    languageId: language.id,
    userId: input.userId,
  })

  return ok({
    comment: row.comment ?? input.comment,
    /** upsertComment は null チェック後に必ず Date を入れるが念のため fallback */
    commentSubmittedAt: row.commentSubmittedAt ?? new Date(),
    entryId: row.id,
    languageSlug: input.languageSlug,
  })
}

type UpdateCommentRepo = {
    hallOfFameEntryRepository: HallOfFameEntryRepository
    languageRepository: LanguageRepository
}

export type UpdateCommentInput = {
    userId: number
    entryId: number
    comment: string
}

/**
 * 自分のコメントを編集（即時反映）
 *
 * - 対象 entry が存在しなければ 404
 * - 他人の entry なら 403
 * - NG ワード含むなら 400
 */
export const updateComment = async (
  input: UpdateCommentInput,
  repo: UpdateCommentRepo,
): Promise<Result<CommentResult>> => {
  logger.debug("HallOfFameService: updateComment", {
    entryId: input.entryId,
    userId: input.userId,
  })

  if (containsNgWord(input.comment)) {
    return err(badRequestError("Comment contains prohibited words"))
  }

  const existing = await repo.hallOfFameEntryRepository.findById(input.entryId)
  if (existing === null) return err(notFoundError("Hall of Fame entry not found"))
  if (existing.userId !== input.userId) return err(forbiddenError("Not your comment"))

  const language = await repo.languageRepository.findById(existing.languageId)
  /** entry が言語 FK を持つため通常 null にはならないが、Language 削除が将来起こる可能性に備える */
  if (language === null) return err(notFoundError("Language not found"))

  const updated = await repo.hallOfFameEntryRepository.updateComment(input.entryId, input.comment)

  return ok({
    comment: updated.comment ?? input.comment,
    commentSubmittedAt: updated.commentSubmittedAt ?? new Date(),
    entryId: updated.id,
    languageSlug: language.slug,
  })
}
