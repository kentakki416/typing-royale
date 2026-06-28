# step2: Web 側で JavaScript を選択可能にする

JavaScript の `languages` 行と問題プールが揃ったら、UI の「近日公開」ゲートを外して選択・プレイできるようにする。**この step は問題プールが十分に積まれた後にデプロイする**（空プールのまま選択可にすると `/solo` が 404 になるため）。

## 対応内容

### `apps/web/src/app/play/page.tsx`（comingSoon 解除）

`LANGUAGE_PRESENTATION` の JavaScript を `comingSoon: false` に変更する。

```ts
const LANGUAGE_PRESENTATION: Record<
  string,
  { comingSoon: boolean; iconClass: string; iconText: string }
> = {
  javascript: { comingSoon: false, iconClass: "js", iconText: "JS" }, // ← true から false
  typescript: { comingSoon: false, iconClass: "ts", iconText: "TS" },
}
```

L17 のコメント（「問題プールが未整備の言語（現状 JavaScript）」）も実態に合わせて更新する。

> 将来的には L18 のコメントにある「problems の有無で動的判定」へ寄せる案もあるが、本 step では静的フラグの切り替えに留める（動的化は language-master の延長で別タスク）。

### `apps/web/src/app/page.tsx`（ホームのバッジ）

ホームの対応言語バッジ（L162-165）は JavaScript を既に `badge warning` で表示済み。**表記変更は不要**。Go 追加時に `Go (近日)` を更新するのは [go-support](../go-support/README.md) 側で行う。

## 動作確認

`apps/web/CLAUDE.md` の「動作確認（必須）」に従い Playwright MCP で確認する：

1. `/play` に遷移し、JavaScript カードが **グレーアウト解除・「近日公開」非表示・ボタン活性**になっていること（`browser_snapshot`）。
2. JavaScript の「▶ 通常プレイ」を押下 → `/play/[sessionId]` に遷移し、JS の関数問題が出題されること。
3. `browser_console_messages` の `level: "error"` が 0 件。

### before/after スクショ（PR 必須）

`apps/web/CLAUDE.md` の規約どおり、`/play` の JavaScript カードについて before（グレーアウト）/ after（活性）を撮影し、`docs/screenshots/javascript-support/{before,after}.png` に保存して PR 本文に絶対 URL で貼る。
</content>
