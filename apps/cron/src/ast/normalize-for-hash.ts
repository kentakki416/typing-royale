import { createHash } from "node:crypto"

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

export const normalize = (codeStripped: string): string =>
  codeStripped.replace(/\s+/g, " ").trim()

export const astHashOf = (codeStripped: string): string =>
  createHash("sha256").update(normalize(codeStripped)).digest("hex")
