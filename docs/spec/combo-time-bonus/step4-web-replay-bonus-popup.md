# step4: リプレイ画面の `+Ns` 演出再現

`/replay/[playSessionId]` でも `keystroke_logs` 再生中に combo マイルストーン到達タイミングで `+Ns` ポップアップ + HUD グロー + 効果音を再現する。プレイ画面と同じユーザー体験をリプレイでも提供する。

## 対応内容

### 1. リプレイ画面のステート構造を把握

`apps/web/src/app/replay/[playSessionId]/` の構造（既存）：

- `page.tsx` が log + meta を fetch
- Client Component (`replay-player.tsx` 等) が log を時系列再生
- 再生中の `elapsedMs` を state で持って HUD / コードハイライト / 進捗バーに反映

### 2. `detectBonuses` で発火タイミングを事前計算

ページロード時 (Server Component or 初回 useEffect) に `detectBonuses(logs)` を呼んで、`BonusEvent[]` を **再生スケジュールと一緒に props で持つ**：

```typescript
import { detectBonuses } from "@/libs/combo-time-bonus"

const bonusEvents = detectBonuses(logs)
```

### 3. 再生 tick 内でポップアップを発火

再生 tick (rAF or setInterval) 内で、`elapsedMs` が次の `bonusEvents` の `elapsedMs` を超えた瞬間に：

```typescript
const [bonusPopups, setBonusPopups] = useState<TimeBonusPopup[]>([])
const popupIdRef = useRef(0)
const firedBonusIdxRef = useRef(0)

const tick = () => {
  const currentMs = computeCurrentElapsedMs()
  /** 次の bonus イベントが現在時刻を超えたら発火 */
  while (
    firedBonusIdxRef.current < bonusEvents.length
    && bonusEvents[firedBonusIdxRef.current]!.elapsedMs <= currentMs
  ) {
    const ev = bonusEvents[firedBonusIdxRef.current]!
    const id = ++popupIdRef.current
    setBonusPopups((prev) => [...prev, { id, addedSec: ev.addedSec }])
    setTimeout(() => setBonusPopups((prev) => prev.filter((p) => p.id !== id)), 1000)
    /** リプレイでも効果音を鳴らす (オプション：ミュート設定に従う) */
    playTimeBonus()
    /** HUD グローも同様 */
    setHudFlash(true)
    setTimeout(() => setHudFlash(false), 500)
    firedBonusIdxRef.current += 1
  }
}
```

### 4. リプレイのシーク（時間ジャンプ）時のリセット

リプレイにシーク機能がある場合は、ユーザーが過去にジャンプしたとき `firedBonusIdxRef.current` を再計算する：

```typescript
const seekTo = (targetMs: number) => {
  /** 既に通り過ぎた bonus event 数を再計算 */
  firedBonusIdxRef.current = bonusEvents.findIndex((e) => e.elapsedMs > targetMs)
  if (firedBonusIdxRef.current === -1) firedBonusIdxRef.current = bonusEvents.length
}
```

シーク機能が無いなら本処理は不要。

### 5. 残り時間 HUD の総時間計算

リプレイは現状 `SESSION_MS = 120_000` 固定で再生する。log が 120s を超える場合の動的拡張（log 最終 elapsed_ms をセッション全長として扱う等）は未実装（将来対応）。

### 6. CSS は [step3](./step3-web-engine-and-countdown.md) と共通

`.time-bonus-popup` / `.time-bonus-cell-flash` のスタイルは globals.css に既に追加済み (step3)。リプレイ側で追加 CSS は不要。

## 動作確認

### 旧仕様リプレイ（時間ボーナス導入前のセッション）

1. dev サーバーで時間ボーナス導入前に記録されたリプレイ ID を開く
2. ポップアップが **1 つも発火しない**（log に combo 30 達成タイミングが無いか、累積延長 0 秒）
3. HUD の残り時間は 120s から始まり 0 で終了

### 新仕様リプレイ（時間ボーナス込みのセッション）

1. dev サーバーで時間ボーナス導入後に記録されたリプレイを開く
2. 再生中、combo 30 / 60 / 90 ... 達成タイミングで `+1s` / `+2s` / `+3s` ポップアップが発火
3. HUD グローも同期する
4. リプレイは現状 120s 固定で延長表示は未実装

### スクショ

- `docs/screenshots/combo-time-bonus/replay-popup.png` - リプレイ再生中のポップアップ
