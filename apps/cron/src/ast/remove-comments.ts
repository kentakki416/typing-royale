import * as ts from "typescript"

/**
 * ソースコードからコメントを除去する。
 *
 * `ts.createScanner` で全トークンを舐め、`SingleLineCommentTrivia` /
 * `MultiLineCommentTrivia` のレンジを集めて後ろから削除する方式。
 *
 * `forEachLeading/TrailingCommentRange` のノード再帰ベースだと leading /
 * trailing が重複列挙されたり、SourceFile 直下のコメントが取りこぼされる
 * 懸念があるため、より素直な scanner ベースを採用。文字列リテラルや正規表現
 * リテラルは scanner が別トークンとして識別するため `"https://..."` 内の
 * `//` も自動で保護される。
 */
export const removeComments = (rawText: string): string => {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /** skipTrivia */ false,
    ts.LanguageVariant.Standard,
    rawText
  )

  const commentRanges: Array<[number, number]> = []
  let token = scanner.scan()
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    // コメントの場合はrangesに追加
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
      commentRanges.push([scanner.getTokenStart(), scanner.getTokenEnd()])
    }
    token = scanner.scan()
  }

  /** 前から消すとインデックスがズレるので、後ろから削除する */
  let result = rawText
  for (let i = commentRanges.length - 1; i >= 0; i--) {
    const [start, end] = commentRanges[i]
    result = result.slice(0, start) + result.slice(end)
  }

  /** 連続空行を 1 行に折り畳む（コメント跡地の空白を抑える） */
  return result.replace(/\n{3,}/g, "\n\n")
}
