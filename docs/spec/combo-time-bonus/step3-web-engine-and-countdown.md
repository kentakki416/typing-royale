# step3: プレイ画面のエンジン拡張・タイマー動的延長・HUD 演出・効果音

プレイ中に combo マイルストーンを検知して、`useCountdown` を動的に延長し、HUD に `+Ns` ポップアップ + gold グロー + 専用効果音を発火する。

## 対応内容

### 1. `useCountdown` を動的延長対応に拡張

`apps/web/src/app/play/[sessionId]/use-countdown.ts`：

```typescript
type Options = {
  durationMs: number
  onTimeUp: () => void
  onTierMilestone?: (kind: MilestoneKind) => void
}

type Result = {
  remainingMs: number
  startAtRef: React.MutableRefObject<number>
  /** combo ボーナスで残り時間を動的延長するため */
  extendDuration: (extraMs: number) => void
}

export function useCountdown({ durationMs, onTimeUp, onTierMilestone }: Options): Result {
  const durationMsRef = useRef(durationMs)

  /** ... 既存 startAtRef / fired30Ref / fired10Ref などはそのまま ... */

  const extendDuration = (extraMs: number) => {
    durationMsRef.current += extraMs
    /** 延長後の残り時間で urgent gate（10s / 30s）を再判定する */
    const now = performance.now()
    const newRemaining = Math.max(0, durationMsRef.current - (now - startAtRef.current))
    if (newRemaining > 30_000) fired30Ref.current = false
    if (newRemaining > 10_000) fired10Ref.current = false
  }

  /** rAF tick 内では durationMsRef.current を使う */
  useEffect(() => {
    const tick = () => {
      const elapsed = performance.now() - startAtRef.current
      const remaining = Math.max(0, durationMsRef.current - elapsed)
      setRemainingMs(remaining)
      /** ... */
    }
    /** ... */
  }, [])

  return { remainingMs, startAtRef, extendDuration }
}
```

### 2. `useTypingEngine` でマイルストーン検知

`apps/web/src/app/play/[sessionId]/use-typing-engine.ts`：

```typescript
import { comboToReward, type BonusEvent } from "@/libs/combo-time-bonus"

type Options = {
  /** ... 既存 props ... */
  /** combo マイルストーン到達時に呼ばれる */
  onComboBonus: (event: BonusEvent) => void
}

export function useTypingEngine({ onComboBonus, /* ... */ }: Options) {
  /** ... 既存 state / refs ... */

  /** 既発火マイルストーンを保持 (1 セッション 1 回のみ発火) */
  const triggeredMilestonesRef = useRef<Set<number>>(new Set())

  /** keydown ハンドラ内、combo インクリメント直後に判定 */
  const onKeyDown = (e: KeyboardEvent) => {
    /** ... 既存判定 ... */
    if (isCorrect) {
      comboRef.current += 1
      setCombo(comboRef.current)

      /** combo マイルストーン判定 */
      const reward = comboToReward(comboRef.current)
      if (reward !== null && !triggeredMilestonesRef.current.has(comboRef.current)) {
        triggeredMilestonesRef.current.add(comboRef.current)
        const elapsed = performance.now() - startAtRef.current
        onComboBonus({
          addedSec: reward,
          elapsedMs: elapsed,
          milestoneCombo: comboRef.current,
        })
      }
      /** ... 既存処理 (tier 判定 / playKeyHit / etc) ... */
    }
  }

  /** ... */
}
```

### 3. `play-loop.tsx` でポップアップ表示 + `extendDuration` 呼び出し

`apps/web/src/app/play/[sessionId]/play-loop.tsx`：

```tsx
import { playTimeBonus } from "@/libs/sound-fx"

type TimeBonusPopup = {
  id: number
  addedSec: number
}

export function PlayLoop(props: Props) {
  const [bonusPopups, setBonusPopups] = useState<TimeBonusPopup[]>([])
  const [hudFlash, setHudFlash] = useState(false)
  const popupIdRef = useRef(0)

  const { remainingMs, startAtRef, extendDuration } = useCountdown({
    durationMs: SESSION_DURATION_MS,
    onTimeUp: () => void finish(),
    onTierMilestone: (kind) => { /* ... 既存 ... */ },
  })

  const handleComboBonus = (event: BonusEvent) => {
    /** 1. タイマー延長 */
    extendDuration(event.addedSec * 1000)
    /** 2. ポップアップ spawn */
    const id = ++popupIdRef.current
    setBonusPopups((prev) => [...prev, { id, addedSec: event.addedSec }])
    setTimeout(() => {
      setBonusPopups((prev) => prev.filter((p) => p.id !== id))
    }, 1000)
    /** 3. HUD gold グロー */
    setHudFlash(true)
    setTimeout(() => setHudFlash(false), 500)
    /** 4. 効果音 */
    playTimeBonus()
  }

  /** useTypingEngine に handleComboBonus を渡す */
  const { /* ... */ } = useTypingEngine({
    /* ... */
    onComboBonus: handleComboBonus,
  })

  return (
    <>
      {/* ... 既存 HUD ... */}
      <div className="play-hud">
        <div className={`hud-cell ${hudFlash ? "time-bonus-flash" : ""}`} style={{ position: "relative" }}>
          {/** ポップアップは hud-cell の左外側に absolute 配置 */}
          <div className="time-bonus-popups">
            {bonusPopups.map((p) => (
              <span
                key={p.id}
                className={`time-bonus-popup time-bonus-popup-${p.addedSec}s`}
                aria-hidden="true"
              >
                +{p.addedSec}s
              </span>
            ))}
          </div>
          <div className="hud-label">残り時間</div>
          <div className={`hud-value ${remainingClass}`}>{remainingSec}s</div>
        </div>
        {/* ... 他の hud-cell ... */}
      </div>
      {/* ... */}
    </>
  )
}
```

### 4. CSS 追加

`apps/web/src/app/globals.css`：

```css
/**
 * combo マイルストーン達成時の +Ns ポップアップと HUD グロー
 * （docs/spec/combo-time-bonus/ 参照）
 */
.time-bonus-popups {
  position: absolute;
  top: 50%;
  right: 100%;
  transform: translateY(-50%);
  margin-right: 12px;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  z-index: 10;
}
.time-bonus-popup {
  font-family: var(--font-mono);
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-shadow: 0 0 12px var(--popup-glow, rgba(255,213,74,0.7)),
               0 2px 4px rgba(0,0,0,0.5);
  animation: time-bonus-fly 1s cubic-bezier(0.25, 1, 0.5, 1) forwards;
  white-space: nowrap;
}
.time-bonus-popup.time-bonus-popup-1s {
  color: #4ea8ff;
  --popup-glow: rgba(78,168,255,0.7);
}
.time-bonus-popup.time-bonus-popup-2s {
  color: #3dffa5;
  --popup-glow: rgba(61,255,165,0.7);
}
.time-bonus-popup.time-bonus-popup-3s {
  color: #ffc83d;
  --popup-glow: rgba(255,200,61,0.85);
}
@keyframes time-bonus-fly {
  0%   { transform: translateY(8px); opacity: 0; }
  20%  { transform: translateY(0); opacity: 1; }
  80%  { transform: translateY(-12px); opacity: 1; }
  100% { transform: translateY(-24px); opacity: 0; }
}

.hud-cell.time-bonus-flash {
  animation: time-bonus-cell-flash 0.5s ease-out;
}
@keyframes time-bonus-cell-flash {
  0%   { box-shadow: 0 0 0 0 rgba(255,200,61,0.6); }
  40%  { box-shadow: 0 0 24px 4px rgba(255,200,61,0.85); }
  100% { box-shadow: 0 0 0 0 rgba(255,200,61,0); }
}
```

### 5. `playTimeBonus` 効果音を追加

`apps/web/src/libs/sound-fx.ts` に [step1](./step1-shared-detect-bonuses.md) の README に書いた `playTimeBonus` を追加（上昇 chime、G5→C6→E6 の arpeggio、note 間隔 0.07s）。

## 動作確認

### Playwright での動作確認

1. dev サーバーで `/play/[sessionId]` を開く
2. ブラウザ console から `dispatchEvent` でひたすら正解打鍵を送る
3. combo 30 で `+1s` ポップアップが残り時間左に出る + HUD が gold グロー + 効果音
4. combo 60 で `+2s`、90 で `+3s` が同様に発火
5. combo 120 / 150 / 180 でも `+3s` が発火し、残り時間が動的に増える
6. 一度 miss して combo 0 → 再度 combo 30 まで戻したとき、ポップアップは **出ない**（1 セッション 1 回ルール）

### 残り時間の動的延長確認

```javascript
/** ブラウザ console で残り時間の RAW 値を取得 */
document.querySelector('.hud-value').textContent  // → "120s", "121s" などが combo マイルストーン時に増える
```

### 効果音確認

実機 / 実音で `playTimeBonus` が `playKeyHit` と重なって聞こえつつ、`playTierUp` とは聞き分けられること。

### スクショ

- `docs/screenshots/combo-time-bonus/before.png` - 通常の HUD
- `docs/screenshots/combo-time-bonus/after-popup.png` - `+1s` ポップアップ + gold グロー発火中
