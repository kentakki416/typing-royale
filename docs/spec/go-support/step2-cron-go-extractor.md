# step2: LanguageExtractor strategy 導入 + Go extractor

`process-repo` に直書きされている TypeScript Compiler API 依存を `LanguageExtractor` strategy に切り出し、Go 用の実装（`tree-sitter-go`）を追加する。この step は **3 言語共通基盤のリファクタ**であり、TypeScript / JavaScript の既存挙動を変えないことが最重要。

## 対応内容

### 依存追加（`apps/cron/package.json`）

```jsonc
{
  "dependencies": {
    "web-tree-sitter": "^0.x",
    "tree-sitter-wasms": "^0.x"   // tree-sitter-go.wasm を含むパッケージ（または個別の wasm を同梱）
  }
}
```

`tree-sitter-go.wasm` を `apps/cron` 内に配置し、`pnpm build` で `dist/` にコピーする（`tsup`/`tsc` の asset コピー設定 or `postbuild` で `cp`）。本番イメージで wasm が見つからないとロード時に落ちるため、build 後の存在確認を CI に入れる。

### `apps/cron/src/ast/language-extractor.ts`（新規・共通 interface）

```ts
export type ExtractedCandidate = {
  /** コメント除去後の本文 */
  codeStripped: string
  functionName: string
  /** 1-indexed（元ファイル基準） */
  sourceLineEnd: number
  sourceLineStart: number
}

export interface LanguageExtractor {
  /** 1 ソースファイルからコメント除去済みの関数候補を返す */
  extract(source: string, filePath: string): ExtractedCandidate[]
  /** テスト関数名など言語固有の除外判定 */
  isExcludedName(functionName: string): boolean
}
```

### `apps/cron/src/ast/ts-function-extractor.ts`（新規・既存ロジック移設）

既存の `extractFunctions` + `removeComments` をラップし、`LanguageExtractor` を実装する。**ロジックは現状のまま**（`ts.createSourceFile` → `extractFunctions` → `removeComments`）。`isExcludedName` は現在 `adoption-check.ts` 内にあるテスト関数名判定（`test` / `it` / `describe` ...）を移設する。

```ts
import * as ts from "typescript"
import { extractFunctions } from "./extract-functions"
import { removeComments } from "./remove-comments"
import type { ExtractedCandidate, LanguageExtractor } from "./language-extractor"

const EXCLUDED_NAMES = new Set([
  "test", "it", "describe", "beforeEach", "afterEach",
  "beforeAll", "afterAll", "setup", "teardown",
])

export class TsFunctionExtractor implements LanguageExtractor {
  extract(source: string, filePath: string): ExtractedCandidate[] {
    const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)
    return extractFunctions(sf).map((fn) => ({
      codeStripped: removeComments(fn.rawText),
      functionName: fn.functionName,
      sourceLineEnd: fn.sourceLineEnd,
      sourceLineStart: fn.sourceLineStart,
    }))
  }
  isExcludedName(name: string): boolean {
    return EXCLUDED_NAMES.has(name)
  }
}
```

### `apps/cron/src/ast/go-function-extractor.ts`（新規）

`tree-sitter-go` で Go をパースし、`function_declaration` / `method_declaration` を抽出。`comment` ノードを本文から除去する。

```ts
import Parser from "web-tree-sitter"
import type { ExtractedCandidate, LanguageExtractor } from "./language-extractor"

/**
 * web-tree-sitter は初期化が非同期（wasm ロード）。Parser を 1 回だけ初期化して
 * 使い回すため、init を await する factory を用意する。
 */
export const createGoExtractor = async (wasmPath: string): Promise<GoFunctionExtractor> => {
  await Parser.init()
  const parser = new Parser()
  const Go = await Parser.Language.load(wasmPath)
  parser.setLanguage(Go)
  return new GoFunctionExtractor(parser)
}

export class GoFunctionExtractor implements LanguageExtractor {
  constructor(private readonly parser: Parser) {}

  extract(source: string, _filePath: string): ExtractedCandidate[] {
    const tree = this.parser.parse(source)
    const out: ExtractedCandidate[] = []
    const visit = (node: Parser.SyntaxNode): void => {
      if (node.type === "function_declaration" || node.type === "method_declaration") {
        const name = node.childForFieldName("name")?.text
        if (name) {
          const rawText = source.slice(node.startIndex, node.endIndex)
          out.push({
            codeStripped: stripComments(node, source),
            functionName: name,
            sourceLineEnd: node.endPosition.row + 1,
            sourceLineStart: node.startPosition.row + 1,
          })
        }
        return // ネスト関数リテラルを二重抽出しないため子は辿らない
      }
      for (const child of node.children) visit(child)
    }
    visit(tree.rootNode)
    return out
  }

  isExcludedName(name: string): boolean {
    return /^(Test|Benchmark|Example|Fuzz)/.test(name)
  }
}

/**
 * 関数ノード配下の comment ノード範囲を後ろから削除して本文を返す。
 * 文字列リテラル内の // は comment ノードにならないので保護される。
 */
const stripComments = (fnNode: Parser.SyntaxNode, source: string): string => {
  const ranges: Array<[number, number]> = []
  const walk = (n: Parser.SyntaxNode): void => {
    if (n.type === "comment") ranges.push([n.startIndex, n.endIndex])
    for (const c of n.children) walk(c)
  }
  walk(fnNode)
  let text = source.slice(fnNode.startIndex, fnNode.endIndex)
  const base = fnNode.startIndex
  for (const [s, e] of ranges.sort((a, b) => b[0] - a[0])) {
    text = text.slice(0, s - base) + text.slice(e - base)
  }
  return text.replace(/\n{3,}/g, "\n\n")
}
```

### `apps/cron/src/service/crawler/process-repo.ts`（リファクタ）

`ts.createSourceFile(...)` の直書き（`process-repo.ts:154`）を、DI された `extractor` 経由に置き換える：

```ts
// 変更前（抜粋）
const sf = ts.createSourceFile(file.path, raw, ts.ScriptTarget.Latest, true)
for (const fn of extractFunctions(sf)) {
  const stripped = removeComments(fn.rawText)
  const adoption = checkAdoption(fn.functionName, stripped)
  ...
}

// 変更後（抜粋）
for (const cand of extractor.extract(raw, file.path)) {
  if (extractor.isExcludedName(cand.functionName)) continue
  const adoption = checkAdoption(cand.functionName, cand.codeStripped)
  if (!adoption.adopted) continue
  const hash = astHashOf(cand.codeStripped)
  ...
}
```

`processRepo` のシグネチャに `extractor: LanguageExtractor` を加える（client / repo と並ぶ DI 引数）。`checkAdoption` からテスト名除外を取り除き（`isExcludedName` に移ったため）、文字数 / 行数 / 非 ASCII / 1 行長の判定だけを残す。

### 既存 task の更新

`crawler-run-typescript.ts`（および javascript-support の `crawler-run-javascript.ts`）で `new TsFunctionExtractor()` を生成して `processRepo` に渡す。

## 動作確認

### リファクタの等価性（最重要）

TypeScript の既存出力が変わらないことをスナップショットで担保する：

```ts
it("リファクタ後も TS の抽出結果が変わらない", () => {
  const extractor = new TsFunctionExtractor()
  const cands = extractor.extract(SAMPLE_TS_SOURCE, "sample.ts")
  expect(cands).toMatchSnapshot()  // リファクタ前の値で固定
})
```

### Go extractor のユニットテスト

```ts
it("func と method を抽出し、Test* を除外する", async () => {
  const extractor = await createGoExtractor(GO_WASM_PATH)
  const src = `
package x
// add は加算する
func Add(a, b int) int { return a + b }
func (s *Server) Start(ctx context.Context) error { return nil }
func TestAdd(t *testing.T) {}
`
  const cands = extractor.extract(src, "x.go")
  const names = cands.map((c) => c.functionName)
  expect(names).toContain("Add")
  expect(names).toContain("Start")
  expect(cands.filter((c) => extractor.isExcludedName(c.functionName))).toHaveLength(1) // TestAdd
  // コメント // add は除去されている
  expect(cands.find((c) => c.functionName === "Add")!.codeStripped).not.toContain("加算")
})
```

`pnpm --filter cron test` でリファクタ等価性テストと Go extractor テストが緑。
</content>
