import { createRequire } from "node:module"

import { Language, type Node, Parser } from "web-tree-sitter"

import type { ExtractedCandidate, LanguageExtractor } from "./language-extractor"

const requireFrom = createRequire(__filename)

/** 関数・メソッド宣言のノード型（tree-sitter-go） */
const GO_FUNCTION_NODE_TYPES = new Set(["function_declaration", "method_declaration"])

/** テスト / ベンチ / 例示 / ファズ関数のプレフィックス（Go の規約） */
const EXCLUDED_NAME_PREFIX = /^(Test|Benchmark|Example|Fuzz)/

/**
 * Go 用の関数抽出 strategy を生成する。
 *
 * tree-sitter-go の wasm ロードが非同期なため factory を await して使う。Parser は
 * 1 度だけ初期化して使い回す（task 冒頭で生成し processRepo のループで共有）。
 * wasm は `tree-sitter-go` パッケージ同梱のものを require.resolve で解決するので、
 * dist へのアセットコピーは不要（node_modules に同梱されるパッケージから読む）。
 */
export const createGoExtractor = async (): Promise<GoFunctionExtractor> => {
  await Parser.init()
  const wasmPath = requireFrom.resolve("tree-sitter-go/tree-sitter-go.wasm")
  const go = await Language.load(wasmPath)
  const parser = new Parser()
  parser.setLanguage(go)
  return new GoFunctionExtractor(parser)
}

/**
 * Go 用の LanguageExtractor 実装。tree-sitter-go で AST を構築し、
 * function_declaration / method_declaration を抽出してコメントを除去する。
 */
export class GoFunctionExtractor implements LanguageExtractor {
  constructor(private readonly parser: Parser) {}

  public extract(source: string, _filePath: string): ExtractedCandidate[] {
    const tree = this.parser.parse(source)
    if (!tree) return []
    const out: ExtractedCandidate[] = []
    const visit = (node: Node): void => {
      if (GO_FUNCTION_NODE_TYPES.has(node.type)) {
        const name = node.childForFieldName("name")?.text
        if (name) {
          out.push({
            codeStripped: stripGoComments(node, source),
            functionName: name,
            sourceLineEnd: node.endPosition.row + 1,
            sourceLineStart: node.startPosition.row + 1,
          })
        }
        /** ネストした関数リテラルの二重抽出を防ぐため、抽出済みノードの子は辿らない */
        return
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i)
        if (child) visit(child)
      }
    }
    visit(tree.rootNode)
    return out
  }

  public isExcludedName(functionName: string): boolean {
    return EXCLUDED_NAME_PREFIX.test(functionName)
  }
}

/**
 * 関数ノード配下の comment ノードのレンジを本文から除去する。
 *
 * 文字列リテラル内の `//` は comment ノードにならないため自動的に保護される。
 * 後ろから削除してインデックスのズレを防ぎ、跡地の連続空行を 1 つに折り畳む
 * （remove-comments.ts の TypeScript 版と同じ方針）。
 */
const stripGoComments = (fnNode: Node, source: string): string => {
  const base = fnNode.startIndex
  const ranges: Array<[number, number]> = []
  const walk = (node: Node): void => {
    if (node.type === "comment") {
      ranges.push([node.startIndex, node.endIndex])
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (child) walk(child)
    }
  }
  walk(fnNode)

  let text = source.slice(fnNode.startIndex, fnNode.endIndex)
  ranges.sort((a, b) => b[0] - a[0])
  for (const [start, end] of ranges) {
    text = text.slice(0, start - base) + text.slice(end - base)
  }
  return text.replace(/\n{3,}/g, "\n\n")
}
