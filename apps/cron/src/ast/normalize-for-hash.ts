import { createHash } from "node:crypto"

/**
 * 連続する半角スペース・タブ・改行を 1 つの半角スペースに置換し前後を trim する
 * 内部正規化処理。astHashOf の入力前処理として使う実装詳細なので export しない
 */
const normalize = (codeWithoutComments: string): string =>
  codeWithoutComments.replace(/\s+/g, " ").trim()

/**
 * コピペ重複排除用の AST ハッシュ生成
 *
 * コメント除去後のコードを正規化（空白を 1 つに圧縮）してから SHA-256 を取る。
 * 識別子（関数名・変数名・引数名）は **意図的に保持** する。リネームしてしまうと
 * 「名前だけが違う本来別の関数」も同一視されてプールの多様性が落ちるため。
 *
 * 同じ関数が複数の repo にコピペされているケース（典型: ユーティリティ関数の
 * 横展開）を `Problem.@@unique([languageId, astHash])` で弾くために使う。
 */
export const astHashOf = (codeWithoutComments: string): string =>
  createHash("sha256").update(normalize(codeWithoutComments)).digest("hex")
