# step3: Web 表示（マイページ・リザルト）とゲスト集計

マイページの「⌨ 苦手文字」とリザルトの「よく間違える文字」に誤入力内訳を併記する。ゲストプレイのクライアント集計も nested 構造に揃える。

## 対応内容

### 1. マイページ（`apps/web/src/app/mypage/page.tsx`）

`me.weak_chars` の各要素が `{ char, count, mistyped: { char, count }[] }` になる。既存の苦手文字行（バー + 回数）の下に内訳を追記する。

```tsx
{me.weak_chars.map((weak, index) => (
  <div key={weak.char} style={{ display: "grid", gap: "4px" }}>
    {/* 既存: 順位 / 文字バッジ / バー / 合計回数 の行はそのまま */}
    {/* 追加: 誤入力内訳 */}
    {weak.mistyped.length > 0 && (
      <div className="text-sm text-muted" style={{ paddingLeft: "54px" }}>
        実際は{" "}
        {weak.mistyped.map((m, i) => (
          <span key={m.char} className="text-mono">
            {i > 0 ? " ・ " : ""}
            {displayChar(m.char)} ×{m.count}
          </span>
        ))}
      </div>
    )}
  </div>
))}
```

`displayChar` は既存関数を再利用（`"?"`（内訳不明）はそのまま `?` 表示でよい。必要なら「不明」表記に変換）。

### 2. リザルト画面（`apps/web/src/app/play/[sessionId]/result-screen.tsx`）

`result.mistype_stats` が nested になる。`topMistypes` の組み立てを「合計降順 top5 ＋ 内訳」に変える。

```tsx
const topMistypes = Object.entries(result.mistype_stats)
  .map(([char, inner]) => ({
    char,
    count: Object.values(inner).reduce((s, n) => s + n, 0),
    mistyped: Object.entries(inner)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([c, count]) => ({ char: c, count })),
  }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 5)
```

表示は「`{` ×4（実際は `(` ×3 ・ `[` ×1）」のように内訳を併記する。`displayChar` 相当の変換をリザルト側にも用意（既存があれば再利用）。

### 3. ゲストプレイは改修不要（サーバー集計）

ゲストプレイも `POST /api/play-sessions/guest/finish` に keystroke_logs を送り、**サーバー側で `aggregateMistypeStats` が集計**する（`apps/web/src/app/play/[sessionId]/play-loop.tsx` は `guestRes.mistype_stats` を受け取って表示するだけ）。したがって step2 のサーバー改修だけでゲストも nested になり、**クライアント / タイピングエンジンの集計改修は不要**。result-screen はゲスト・認証の両方で同じ nested `mistype_stats` を表示する。

## 動作確認

`apps/web/CLAUDE.md` に従い **Playwright MCP で実画面確認**（`verify-web-page` skill）。`pnpm build` だけで「確認済み」としない。

- マイページ：JWT cookie を注入して `/mypage` に着地（`/sign-in` リダイレクトでない）、苦手文字カードに内訳行が表示される、`console_messages` の error 0 件。
- リザルト：ゲスト/認証それぞれでプレイ完走 → リザルトの「よく間違える文字」に内訳が出る。再現が重い場合は NODE_ENV!=="production" の debug page に nested の mock `mistype_stats` を流して単独レンダリングし撮影する。
- スクショ：`docs/screenshots/mistype-confusion/{before,after}.png` を撮り PR 本文に head branch の raw URL で貼る。

```bash
cd apps/web && pnpm build   # 型・ルートの最低限チェック（これだけでは不十分）
```
