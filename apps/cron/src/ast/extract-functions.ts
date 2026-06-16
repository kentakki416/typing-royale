import * as ts from "typescript"

export type ExtractedFunction = {
  functionName: string
  /** コメント除去前の元テキスト（行末改行は含まない） */
  rawText: string
  /** 1-indexed */
  sourceLineEnd: number
  /** 1-indexed */
  sourceLineStart: number
}

/**
 * ソースファイルから関数ノードを抽出する関数
 *
 * 抽出対象は以下の 3 種類:
 *   1. FunctionDeclaration:    function foo(...) {}
 *   2. MethodDeclaration:      クラスメソッド / オブジェクトメソッド
 *   3. const に代入された ArrowFunction / FunctionExpression
 *      （宣言全体を rawText に含める。例: `export const foo = (...) => {...}`）
 *
 * オブジェクトリテラルのプロパティアロー関数（`{ foo: () => {} }`）は
 * 抽出対象外。タイピング画面に表示される `code_block` に名前が含まれず
 * 「無名関数の一部」に見えるため。method shorthand（`{ foo() {} }`）は
 * MethodDeclaration として 2. で拾われる。
 *
 * 抽出した関数ノードの子は **再帰せず** に走査を打ち切る。これにより
 * 関数内のネスト関数（メソッド内の IIFE など）が二重抽出されない。
 */
export const extractFunctions = (sourceFile: ts.SourceFile): ExtractedFunction[] => {
  const result: ExtractedFunction[] = []
  const visit = (node: ts.Node): void => {
    const extractedFunction = tryExtract(node, sourceFile)
    if (extractedFunction) {
      result.push(extractedFunction)
      /** ネスト関数の二重抽出を防ぐため、抽出済みノードの子は走査しない */
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return result
}

const tryExtract = (node: ts.Node, sf: ts.SourceFile): ExtractedFunction | null => {
  /** 1. function foo(...) {} */
  if (ts.isFunctionDeclaration(node) && node.name) {
    return build(node, sf, node.name.text)
  }
  /** 2. class メソッド / オブジェクトメソッド */
  if (ts.isMethodDeclaration(node) && node.name) {
    return build(node, sf, node.name.getText(sf))
  }
  /**
   * 3. const foo = (...) => {} / const foo = function (...) {}
   * 「const foo = 」を rawText に含めるため、build には VariableStatement を渡す。
   * 単一宣言の VariableStatement (`export const foo = ...`) のみ対象。
   * 複数宣言 (`const a = 1, foo = () => {}`) や for ループ初期化子 (`for (const x of ...)`) は対象外。
   */
  if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
    const init = node.initializer
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
      const list = node.parent
      if (ts.isVariableDeclarationList(list) && list.declarations.length === 1) {
        const stmt = list.parent
        if (ts.isVariableStatement(stmt)) {
          return build(stmt, sf, node.name.text)
        }
      }
    }
  }
  return null
}

const build = (node: ts.Node, sf: ts.SourceFile, name: string): ExtractedFunction => {
  const start = node.getStart(sf)
  const end = node.getEnd()
  const { line: lineStart } = sf.getLineAndCharacterOfPosition(start)
  const { line: lineEnd } = sf.getLineAndCharacterOfPosition(end)
  return {
    functionName: name,
    rawText: sf.text.slice(start, end),
    sourceLineEnd: lineEnd + 1,
    sourceLineStart: lineStart + 1,
  }
}
