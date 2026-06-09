import type { PlaySessionProblem } from "../../types/domain"

/**
 * 出題 1 件をレスポンス用 snake_case object に詰め替える
 *
 * start-solo / start-challenge-gods / replay で同じ shape を返すため共通化する。
 * replay の `ReplaySource.problems[]` は `{ orderIndex, problem: { ... } }` のネスト構造なので
 * 呼び出し側で flat に展開してから渡す。
 */
export const toProblemDto = (problem: PlaySessionProblem) => ({
  char_count: problem.charCount,
  code_block: problem.codeBlock,
  function_name: problem.functionName,
  id: problem.id,
  line_count: problem.lineCount,
  order_index: problem.orderIndex,
  source_url: problem.sourceUrl,
})
