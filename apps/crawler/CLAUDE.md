# apps/crawler

問題プールクローラと毎時ランキングバッチを兼ねる Node.js ワーカー。CLI として `tsx` 経由で実行する。

## Commands

```bash
pnpm dev                      # tsx watch で src/index.ts を起動
pnpm build                    # dist/ にコンパイル
pnpm crawler:run              # 週次クローラ実行（Phase 2 で実装）
pnpm crawler:license-recheck  # 月次ライセンス再検証（Phase 2 で実装）
pnpm batch:ranking            # 毎時ランキング集計（Phase 4 で実装）
```

## ディレクトリ構成（Phase 0 時点）

```
apps/crawler/
├── src/
│   ├── cli/                  # CLI エントリポイント
│   │   ├── run.ts            # 週次クローラ
│   │   ├── license-recheck.ts
│   │   └── ranking-batch.ts
│   ├── log/                  # 共通ロガー (pino)
│   └── index.ts              # pnpm dev のエントリ（起動確認用）
├── Dockerfile                # dev / runner マルチステージ
├── package.json
└── tsconfig.json
```

実処理は Phase 2 / Phase 4 で追加する。設計詳細は [`docs/spec/problem-pool/`](../../docs/spec/problem-pool/) を参照。

## コードスタイル

ルート `CLAUDE.md` の「Code Style and Linting」と同じ規約に従う。Function style は API と同じく `const + arrow function` を使う。
