import * as ts from "typescript"

import { extractFunctions } from "./extract-functions"
import type { ExtractedCandidate, LanguageExtractor } from "./language-extractor"
import { removeComments } from "./remove-comments"

/**
 * テストフレームワークの予約関数名。問題として不適切なので採用しない。
 * （旧 adoption-check.ts の EXCLUDED_NAMES を strategy 側へ移設）
 */
const EXCLUDED_NAMES = new Set([
  "afterAll",
  "afterEach",
  "beforeAll",
  "beforeEach",
  "describe",
  "it",
  "setup",
  "teardown",
  "test",
])

/**
 * TypeScript / JavaScript 用の関数抽出 strategy。
 *
 * TypeScript Compiler API は `.ts` / `.tsx` だけでなく `.js` / `.mjs` / `.cjs` も
 * ファイル名の拡張子から ScriptKind を自動推定してパースできるため、TS と JS の
 * 両 task で本 extractor を共有する。抽出ロジックは既存の extractFunctions /
 * removeComments をそのまま利用する（挙動は不変）。
 */
export class TsFunctionExtractor implements LanguageExtractor {
  public extract(source: string, filePath: string): ExtractedCandidate[] {
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)
    return extractFunctions(sourceFile).map((fn) => ({
      codeStripped: removeComments(fn.rawText),
      functionName: fn.functionName,
      sourceLineEnd: fn.sourceLineEnd,
      sourceLineStart: fn.sourceLineStart,
    }))
  }

  public isExcludedName(functionName: string): boolean {
    return EXCLUDED_NAMES.has(functionName)
  }
}
