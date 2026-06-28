# step4: Web 側で Go を選択可能にする

Go の `languages` 行と問題プールが揃ったら、UI に Go を追加して選択・プレイできるようにする。**問題プールが十分に積まれた後にデプロイする**（空プールのまま選択可にすると `/solo` が 404 になるため、本 step は go-support の最後に当てる）。

## 対応内容

### `apps/web/src/app/play/page.tsx`（表示メタを追加）

`LANGUAGE_PRESENTATION` に Go を追加する。`getLanguages()` が Go 行を返すようになるので、表示メタが無いと `DEFAULT_PRESENTATION`（comingSoon: true）にフォールバックして選択不可のままになる。

```ts
const LANGUAGE_PRESENTATION: Record<
  string,
  { comingSoon: boolean; iconClass: string; iconText: string }
> = {
  go: { comingSoon: false, iconClass: "go", iconText: "Go" }, // ← 追加
  javascript: { comingSoon: false, iconClass: "js", iconText: "JS" },
  typescript: { comingSoon: false, iconClass: "ts", iconText: "TS" },
}
```

`go` アイコンの `iconClass` に対応する CSS（カラー等）を既存の `.lang-icon.ts` / `.lang-icon.js` に倣って追加する。

### `apps/web/src/app/page.tsx`（ホームのバッジ）

対応言語バッジ（L165）の `Go (近日)` を `Go` に変更する。

```tsx
<span className="badge success">Go</span>   // 「(近日)」を削除
```

## 動作確認

`apps/web/CLAUDE.md` の「動作確認（必須）」に従い Playwright MCP で確認する：

1. `/play` に遷移し、Go カードが活性（グレーアウトなし・「近日公開」非表示）で表示される（`browser_snapshot`）。
2. Go の「▶ 通常プレイ」を押下 → `/play/[sessionId]` に遷移し、Go の関数 / メソッド問題が出題される。
3. ホーム（`/`）の対応言語バッジが `Go`（近日表記なし）になっている。
4. `browser_console_messages` の `level: "error"` が 0 件。

### before/after スクショ（PR 必須）

`/play` と `/`（対応言語バッジ）について before（Go なし / 近日）/ after（Go 活性）を撮影し、`docs/screenshots/go-support/{before,after}.png` に保存して PR 本文に絶対 URL で貼る。
</content>
