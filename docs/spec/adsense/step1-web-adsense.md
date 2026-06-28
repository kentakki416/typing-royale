# step1-web-adsense: AdSense 配信基盤の Web 実装

[`./README.md`](./README.md) の設計に基づき、`apps/web` に Google AdSense のディスプレイ広告を導入する。

このステップのゴールは **「AdSense アカウント取得前でも安全にデプロイできる基盤」** を作ること。
パブリッシャー ID（`NEXT_PUBLIC_ADSENSE_CLIENT`）が未設定の間は、広告スクリプト・広告ユニット・`ads.txt`
のいずれも一切露出しない。アカウント取得後は **環境変数を設定するだけ** で配信が有効になる。

## 対応内容

### 環境変数（`apps/web/src/env.ts`）

| 変数 | 例 | 用途 |
| --- | --- | --- |
| `NEXT_PUBLIC_ADSENSE_CLIENT` | `ca-pub-1234567890123456` | パブリッシャー ID。未設定なら広告は描画されない |
| `NEXT_PUBLIC_ADSENSE_SLOT_HOME` | `1234567890` | トップ画面の広告ユニットスロット ID |

いずれも `NEXT_PUBLIC_` prefix のためビルド時にクライアントへインライン化される。
`env.ts` は `server-only` のため、**クライアントコンポーネントからは `process.env.NEXT_PUBLIC_ADSENSE_CLIENT` を直接参照**する
（`env` オブジェクトの import は不可）。

### 共通スクリプトローダー（`components/ads/adsense-script.tsx`）

`next/script` の `strategy="afterInteractive"` で `adsbygoogle.js` を 1 度だけ読み込む。
`NEXT_PUBLIC_ADSENSE_CLIENT` が空なら `null` を返す。`app/layout.tsx` の `<body>` 末尾でレンダリングする。

```tsx
<body className={jetbrainsMono.variable}>
  {children}
  <AdSenseScript />
</body>
```

### 広告ユニット（`components/ads/ad-unit.tsx`）

`<ins class="adsbygoogle">` を描画し、`useEffect` で `window.adsbygoogle.push({})` を呼ぶクライアントコンポーネント。
CLS 対策に `minHeight` を予約する。設置例：

```tsx
<AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME ?? ""} />
```

**設置してよい画面 / だめな画面**（[README の掲載面表](./README.md#掲載面と非表示面)に従う）：

- ✅ トップ / ランキング / リザルト / Hall of Fame / マイページ / リプレイ（再生終了後）
- ❌ `/play`（タイピング中）・ゴースト対戦中 … 集中を妨げ、誤クリック誘発で AdSense ポリシー違反になるため**設置禁止**

新しい画面に追加するときは、各画面用のスロット env を `env.ts` に足し、同じ要領で `<AdUnit slot={...} />` を置く。

### `ads.txt`（`app/ads.txt/route.ts`）

`https://typing-royale.com/ads.txt` を Route Handler で動的生成する。
`NEXT_PUBLIC_ADSENSE_CLIENT` から `ca-` を除いた `pub-...` を使い、未設定時は 404。

```
google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
```

### プライバシーポリシー（`app/privacy/page.tsx`）

AdSense 審査で必須の「Cookie・第三者配信事業者による情報利用」を明示するページ。
ホームのフッター「プライバシー」リンクを `/privacy` に接続済み。
問い合わせ先は `fujimorikenta@icloud.com`。

## 動作確認

`NEXT_PUBLIC_ADSENSE_CLIENT` 未設定（既定）の状態で：

- `pnpm --filter web build` が通る
- `/`（トップ）で広告枠・広告スクリプトの DOM が出力されない（`adsbygoogle` 不在）
- `/privacy` が 200 で表示され、Cookie / AdSense の記載がある
- `/ads.txt` が 404 を返す

`NEXT_PUBLIC_ADSENSE_CLIENT` を設定した状態（アカウント取得後）で：

- `<head>` に `adsbygoogle.js?client=ca-pub-...` が 1 度だけ読み込まれる
- `/ads.txt` が `google.com, pub-..., DIRECT, f08c47fec0942fa0` を返す
- 設置画面に `<ins class="adsbygoogle">` が出力される（実際の広告表示は審査通過後）

## このステップに含まれない（運用者 / 将来対応）

- AdSense アカウント作成・サイト登録・審査依頼（コードでは不可）
- 環境変数の本番設定（Vercel）
- GDPR 同意管理（Consent Mode v2）… EU トラフィックが増えた段階で別ステップ
- トップ以外の画面への `<AdUnit>` 追加（スロット発行後に順次）
