# TypeScript Compiler API リファレンス（cron 用）

`apps/cron` のクローラは GitHub から取得した `.ts` / `.js` ファイルを **TypeScript Compiler API** で AST 解析し、関数を抽出してタイピング問題に変換する。本書はそこで使っている主要な型・関数のキャッチアップ用リファレンス。

## 目次

- [前提知識](#前提知識)
  - [AST（抽象構文木）とは](#ast抽象構文木とは)
  - [Visitor Pattern と「visit」の意味](#visitor-pattern-と-visit-の意味)
  - [Node / Token / Trivia の関係](#node--token--trivia-の関係)
- [使用している関数・型](#使用している関数型)
  - [パーサ系](#パーサ系)
  - [ノード判定（type guards）](#ノード判定type-guards)
  - [走査](#走査)
  - [位置・テキスト取得](#位置テキスト取得)
  - [Scanner（トークン単位の走査）](#scannerトークン単位の走査)
- [実例: `extract-functions.ts` の読み解き](#実例-extract-functionsts-の読み解き)
- [実例: `strip-comments.ts` の読み解き](#実例-strip-commentsts-の読み解き)
- [学習リソース](#学習リソース)

## 前提知識

### AST（抽象構文木）とは

ソースコードをコンパイラが理解できる **木構造** に分解したもの。`function foo() { return 1 }` を AST にすると:

```
SourceFile
└─ FunctionDeclaration              (name: "foo")
   ├─ Identifier ("foo")
   ├─ Block                         (関数本体 { ... })
   │  └─ ReturnStatement
   │     └─ NumericLiteral ("1")
   └─ ...
```

各ノードは型情報（`FunctionDeclaration` / `Block` / `ReturnStatement` 等）を持つ。AST を「上から下へ歩く」ことで「関数の名前は何か」「return している値は何か」を取り出せる。

### Visitor Pattern と「visit」の意味

AST のような木構造を走査する古典パターン。「**1 ノードに立ち寄って処理する**」を `visit` と呼ぶ（観光客が街の名所を 1 つずつ訪れるメタファー）。コードでは:

```typescript
const visit = (node: ts.Node): void => {
  /** node に対する処理 */
  ts.forEachChild(node, visit)   /** 子ノードへ再帰 */
}
visit(sourceFile)                /** ルートから走査開始 */
```

「ファイルを訪問する」ではなく「ノードを訪問する（= 処理する）」の意味なので、`walk` / `traverse` と命名しても同義。

### Node / Token / Trivia の関係

| 種類 | 例 | 解説 |
|---|---|---|
| **Node** | `FunctionDeclaration` / `ReturnStatement` | 構文木の各要素。`ts.Node` が基底型 |
| **Token** | `function` キーワード / `{` / `;` | 字句解析（lex）された最小単位。Node のうち子を持たないリーフ |
| **Trivia** | コメント / 空白 / 改行 | 文法的に意味を持たない補助情報。Node や Token の前後に「付属」する |

ノード走査（`forEachChild`）では Trivia は **見えない**。コメントを扱いたいときは Scanner で直接トークン列を舐めるか、`forEachLeading/TrailingCommentRange` を使う。

## 使用している関数・型

### パーサ系

#### `ts.createSourceFile(filename, text, target, setParentNodes)`
**ソースコード文字列を AST に変換する関数。** ファイル 1 つを 1 回パース。

```typescript
const sf: ts.SourceFile = ts.createSourceFile(
  "example.ts",
  "function foo() { return 1 }",
  ts.ScriptTarget.Latest,
  true   /** setParentNodes: node.parent を辿れるようにする */
)
```

戻り値の `ts.SourceFile` がツリーのルート。

#### `ts.SourceFile`
`ts.Node` を継承したルートノードの型。次のような追加メソッドを持つ:
- `sf.text` — 元のソース文字列
- `sf.getLineAndCharacterOfPosition(pos)` — オフセット → 行・列

#### `ts.Node`
すべての AST ノードの基底型。`isXxx` 系の type guard で具体的な型に絞り込む。

### ノード判定（type guards）

「このノードは何の種類か？」を真偽値で返しつつ、true なら **TypeScript の型推論が自動で絞り込まれる** 便利関数群。

| 関数 | match するコード例 | 取れる情報 |
|---|---|---|
| `ts.isFunctionDeclaration(node)` | `function foo() {}` | `node.name?: Identifier` |
| `ts.isMethodDeclaration(node)` | `class C { greet() {} }` / `{ hello() {} }` | `node.name: PropertyName` |
| `ts.isVariableDeclaration(node)` | `const bar = ...` の `bar = ...` 部分 | `node.name`, `node.initializer?` |
| `ts.isIdentifier(node)` | `foo` のような素の識別子 | `node.text` |
| `ts.isArrowFunction(node)` | `(x) => x * 2` | `node.body`, `node.parameters` |
| `ts.isFunctionExpression(node)` | `function() {}`（式の位置） | `node.name?`, `node.body` |
| `ts.isPropertyAssignment(node)` | オブジェクトリテラルの `foo: 1` | `node.name`, `node.initializer` |

> `FunctionDeclaration`（文の位置）と `FunctionExpression`（式の位置）は別ノード。`function foo() {}` は前者、`const x = function() {}` の右辺は後者。

### 走査

#### `ts.forEachChild(node, callback)`
ノードの **直接の子** を 1 つずつ callback に渡す（**再帰はしない**）。callback 内で再度 `forEachChild` を呼べば深く潜れる。

```typescript
ts.forEachChild(sourceFile, (child) => {
  /** child は sourceFile の直接の子のみ */
  console.log(ts.SyntaxKind[child.kind])
})
```

### 位置・テキスト取得

#### `node.getStart(sourceFile)`
ノードがソース上で **何文字目から始まるか**（0-indexed のオフセット）。`sourceFile` を渡すのは leading trivia（先頭のコメント・空白）を除外した「実コードの開始位置」を計算するため。

#### `node.getEnd()`
ノードの終了オフセット（末尾の文字の次の位置、exclusive）。

#### `sf.getLineAndCharacterOfPosition(pos)`
オフセット位置を `{ line, character }` に変換する。**ここでも 0-indexed** なので、人間向けの 1-indexed にするには `+1` する。

```typescript
const start = node.getStart(sf)
const { line, character } = sf.getLineAndCharacterOfPosition(start)
const humanLine = line + 1   /** 1-indexed */
```

#### `sf.text.slice(start, end)`
ノードに対応するソースコードの **原文** を取り出す。フォーマット・インデント・コメントもそのまま含む。

### Scanner（トークン単位の走査）

`extract-functions.ts` がノード木を歩くのに対し、`strip-comments.ts` は **トークン列をフラットに舐める** 別の API を使う。

#### `ts.createScanner(target, skipTrivia, variant, text)`
字句解析器を作る。

```typescript
const scanner = ts.createScanner(
  ts.ScriptTarget.Latest,
  /** skipTrivia */ false,        /** false なら Trivia もトークンとして列挙 */
  ts.LanguageVariant.Standard,    /** Standard = JS/TS、JSX 用は別 variant */
  rawText
)
```

`skipTrivia: false` にすると `SingleLineCommentTrivia` / `MultiLineCommentTrivia` などの Trivia もトークンとして拾える。コメント除去にはこれが必須。

#### `scanner.scan()`
**次のトークンに進めて、その種類（`SyntaxKind`）を返す**。返り値が `ts.SyntaxKind.EndOfFileToken` になったら走査終了。

```typescript
let token = scanner.scan()
while (token !== ts.SyntaxKind.EndOfFileToken) {
  /** 現在のトークンに対する処理 */
  token = scanner.scan()
}
```

#### `scanner.getTokenStart()` / `scanner.getTokenEnd()`
現在のトークンが「元の文字列の何文字目〜何文字目」かを返す（0-indexed オフセット）。

#### `ts.SyntaxKind`
ノード・トークンの種別を列挙した `enum`。コメント関連でよく使うもの:

| 値 | 意味 |
|---|---|
| `ts.SyntaxKind.SingleLineCommentTrivia` | `// ...` |
| `ts.SyntaxKind.MultiLineCommentTrivia` | `/* ... */` / `/** ... */` |
| `ts.SyntaxKind.EndOfFileToken` | ファイル末端（走査終了の合図） |
| `ts.SyntaxKind.StringLiteral` | `"..."` / `'...'` |
| `ts.SyntaxKind.TemplateHead` / `TemplateMiddle` / `TemplateTail` | `` `...${X}...` `` の各セグメント |
| `ts.SyntaxKind.RegularExpressionLiteral` | `/.../flags` |

Scanner は文字列リテラルや正規表現を **別トークン** として識別するので、`"https://..."` の中の `//` はコメントとして扱われない（= 自動で保護される）。

## 実例: `extract-functions.ts` の読み解き

```typescript
export const extractFunctions = (sourceFile: ts.SourceFile): ExtractedFunction[] => {
  const result: ExtractedFunction[] = []

  /** AST を上から下へ歩く（Visitor Pattern） */
  const visit = (node: ts.Node): void => {
    const fn = tryExtract(node, sourceFile)
    if (fn) {
      result.push(fn)
      /** 抽出済みノードの子は再帰しない（ネスト関数の二重抽出防止） */
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return result
}

/** 4 種類のノードを判定 */
const tryExtract = (node: ts.Node, sf: ts.SourceFile): ExtractedFunction | null => {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return build(node, sf, node.name.text)
  }
  if (ts.isMethodDeclaration(node) && node.name) {
    return build(node, sf, node.name.getText(sf))
  }
  if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
    const init = node.initializer
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
      return build(init, sf, node.name.text)
    }
  }
  if (ts.isPropertyAssignment(node) && ts.isArrowFunction(node.initializer)) {
    return build(node.initializer, sf, node.name.getText(sf))
  }
  return null
}

/** 位置とテキストを取り出す */
const build = (node: ts.Node, sf: ts.SourceFile, name: string): ExtractedFunction => {
  const start = node.getStart(sf)
  const end = node.getEnd()
  const { line: lineStart } = sf.getLineAndCharacterOfPosition(start)
  const { line: lineEnd } = sf.getLineAndCharacterOfPosition(end)
  return {
    functionName: name,
    rawText: sf.text.slice(start, end),
    sourceLineEnd: lineEnd + 1,       /** 0-indexed → 1-indexed */
    sourceLineStart: lineStart + 1,
  }
}
```

3 段パイプライン：

1. **`visit`**：木をルートから DFS で歩く（ネスト関数の子は飛ばす）
2. **`tryExtract`**：各ノードが 4 種類のどれかを type guard で判定
3. **`build`**：マッチしたノードの開始/終了位置と原文を取り出す

## 実例: `strip-comments.ts` の読み解き

```typescript
export const stripComments = (rawText: string): string => {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /** skipTrivia */ false,
    ts.LanguageVariant.Standard,
    rawText
  )

  /** トークンを 1 つずつ進めてコメント範囲だけを集める */
  const ranges: Array<[number, number]> = []
  let token = scanner.scan()
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (
      token === ts.SyntaxKind.SingleLineCommentTrivia
      || token === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      ranges.push([scanner.getTokenStart(), scanner.getTokenEnd()])
    }
    token = scanner.scan()
  }

  /** 後ろから削除（前から消すと未処理側のインデックスがズレる） */
  let stripped = rawText
  for (let i = ranges.length - 1; i >= 0; i--) {
    const [pos, end] = ranges[i]
    stripped = stripped.slice(0, pos) + stripped.slice(end)
  }

  /** 連続空行を 1 行に折り畳む（コメント跡地の空白を抑える） */
  return stripped.replace(/\n{3,}/g, "\n\n")
}
```

ノード木ではなく **トークン列** を走査するパターン。`scanner.scan()` でループしてコメント種別だけ集め、後ろから削除する。Scanner が文字列・正規表現を別トークン扱いするため、`"https://..."` 内の `//` などは自動で保護される。

## 学習リソース

### 1. [AST Explorer](https://astexplorer.net/)
左にコードを貼ると右に AST が即時表示される定番ツール。`Language: JavaScript` → `Parser: typescript` を選ぶと TypeScript Compiler API と同じ構造で見える。「このコードが AST 上どう見えるか」をすぐ確認できる。

### 2. [TypeScript Compiler API Wiki（公式）](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
公式チュートリアル。`createSourceFile` / Visitor Pattern / type guard の使い方が一通り載っている。

### 3. [TypeScript AST Viewer](https://ts-ast-viewer.com/)
AST Explorer よりリッチな TS 専用ビューア。`SyntaxKind` の数値や `flags` も表示される。
