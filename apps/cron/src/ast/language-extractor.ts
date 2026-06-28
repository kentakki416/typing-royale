/**
 * 言語非依存の関数抽出 strategy。
 *
 * 言語ごとに AST パーサが異なる（TypeScript Compiler API / tree-sitter-go 等）ため、
 * 「1 ソースファイル → コメント除去済みの関数候補」への変換を本 interface に閉じ込め、
 * process-repo 側は fetch / ライセンス / サンプリング / 保存の共通フローだけを持つ。
 */
export type ExtractedCandidate = {
  /** コメント除去後の関数本文 */
  codeStripped: string
  functionName: string
  /** 1-indexed（元ファイル基準の終了行） */
  sourceLineEnd: number
  /** 1-indexed（元ファイル基準の開始行） */
  sourceLineStart: number
}

export interface LanguageExtractor {
  /** 1 ソースファイルからコメント除去済みの関数候補を返す */
  extract(source: string, filePath: string): ExtractedCandidate[]
  /** テスト関数名など、言語固有の採用除外判定（true なら採用しない） */
  isExcludedName(functionName: string): boolean
}
