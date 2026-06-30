import * as ts from "typescript"

import { removeBlankLines } from "./remove-blank-lines"

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
 *
 * 置換あり（`${...}`）のテンプレートリテラルだけは `scan()` の単純ループでは
 * 追えない。`` `...${ `` を `TemplateHead` として読んだ後、置換式を閉じる `}`
 * は `reScanTemplateToken()` を呼んで初めて `TemplateMiddle` / `TemplateTail`
 * として続きを読める（TypeScript パーサ本体と同じ）。これを呼ばないと `}` を
 * ただの閉じ波括弧として読み飛ばし、テンプレ末尾の閉じバッククォートを
 * **新しいテンプレートの開きバッククォート** と誤認して以降を文字列として
 * 飲み込み、その中のコメントが除去されなくなる。置換の波括弧深度をスタックで
 * 管理し、対応する `}` で再スキャンする。
 */
export const removeComments = (rawText: string): string => {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /** skipTrivia */ false,
    ts.LanguageVariant.Standard,
    rawText
  )

  const commentRanges: Array<[number, number]> = []
  /** 各テンプレート置換 `${` が始まった時点の波括弧深度を積むスタック */
  const templateSubstitutionDepths: number[] = []
  let braceDepth = 0
  let token = scanner.scan()
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
      /** コメントの場合は ranges に追加 */
      commentRanges.push([scanner.getTokenStart(), scanner.getTokenEnd()])
    } else if (token === ts.SyntaxKind.TemplateHead) {
      /** `` `...${ `` に入った: 置換式の開始深度を記録 */
      templateSubstitutionDepths.push(braceDepth)
    } else if (token === ts.SyntaxKind.OpenBraceToken) {
      braceDepth++
    } else if (token === ts.SyntaxKind.CloseBraceToken) {
      const top = templateSubstitutionDepths[templateSubstitutionDepths.length - 1]
      if (templateSubstitutionDepths.length > 0 && top === braceDepth) {
        /** この `}` は置換式 `${...}` を閉じる: テンプレ末尾として再スキャンする */
        templateSubstitutionDepths.pop()
        const retoken = scanner.reScanTemplateToken(/** isTaggedTemplate */ false)
        /** `` }...${ ``（TemplateMiddle）なら次の置換式が続くので深度を積み直す */
        if (retoken === ts.SyntaxKind.TemplateMiddle) {
          templateSubstitutionDepths.push(braceDepth)
        }
        token = scanner.scan()
        continue
      }
      braceDepth--
    }
    token = scanner.scan()
  }

  /** 前から消すとインデックスがズレるので、後ろから削除する */
  let result = rawText
  for (let i = commentRanges.length - 1; i >= 0; i--) {
    const [start, end] = commentRanges[i]
    result = result.slice(0, start) + result.slice(end)
  }

  /** コメント跡地の空行・元からの空行をすべて詰める（タイピング中のノイズ防止） */
  return removeBlankLines(result)
}
