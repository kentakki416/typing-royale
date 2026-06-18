# 機能仕様クイックリファレンス

このプロジェクトで実装されている / 設計中の機能の一覧です。プロダクト全体像は [`../README.md`](../README.md) を参照してください。各機能の詳細は `./{feature}/README.md` を参照してください。

このファイルは `design-feature` skill で新機能を設計するたびに更新されます。

## 機能一覧

| 機能名 | ステータス | 概要 | リンク |
|---|---|---|---|
| typing-engine | ✅ | タイピングコアエンジン。120 秒制限・関数の連続出題・入力判定・スコア計算 | [./typing-engine/README.md](./typing-engine/README.md) |
| play-audio | ✅ | プレイ画面の SE（打鍵音・tier アップ・finish 等）と音量コントロール UI。BGM なし、Web Audio API でフル procedural 生成 | [./play-audio/README.md](./play-audio/README.md) |
| combo-time-bonus | 🟡 設計中 | combo マイルストーン（20 / 40 / 60 / 80 / ...）達成でプレイ時間に +1 / +2 / +3 秒のボーナスを動的に加算。HUD ポップアップ + gold グロー + 専用 SE。サーバーで cheat 検証 | [./combo-time-bonus/README.md](./combo-time-bonus/README.md) |
| problem-pool | ✅ | 問題プール。週次 cron で GitHub Star 上位の寛容ライセンス OSS をクロールし AST で関数本体を抽出 | [./problem-pool/README.md](./problem-pool/README.md) |
| github-auth | ✅ | GitHub OAuth。読み取り最小スコープでのログイン・アカウント管理 | [./github-auth/README.md](./github-auth/README.md) |
| score-ranking | ✅ | スコア記録・ランキング集計（言語×全期間トップ 1000）。**エンジニアグレード**（Intern → Fellow の 8 段階）で個人成長を可視化 | [./score-ranking/README.md](./score-ranking/README.md) |
| monthly-ranking | 🟡 v2 設計中 | 月間ランキング（JST 暦月）。`/finish` 内で `monthly_ranking_snapshots` を**リアルタイム同期 UPSERT**。cron 廃止、`rank` カラム廃止、TOP 10 cap 維持。/ranking は当月 TOP 10、ホームは TOP 5 サマリ | [./monthly-ranking/README.md](./monthly-ranking/README.md) |
| result-top-ten-popup | 🟡 設計中 | リザルト画面到達時の TOP 10 入賞お知らせポップアップ。殿堂入り入賞 (挑戦される) / 月間 TOP 10 入賞 (視聴される) の 2 種を順次表示 | [./result-top-ten-popup/README.md](./result-top-ten-popup/README.md) |
| ghost-battle | ✅ | ゴースト併走（「神々に挑戦」モード）。言語選択画面のボタンからランダムなトップ 10 と同じ問題シーケンスで対戦 | [./ghost-battle/README.md](./ghost-battle/README.md) |
| replay-viewer |　✅ | リプレイ閲覧。トップ 10 入賞プレイのキーストローク再描画 | [./replay-viewer/README.md](./replay-viewer/README.md) |
| rewards | ✅ | 特典（リワード）。SVG バッジ・達成カード・3D アイコン・Hall of Fame | [./rewards/README.md](./rewards/README.md) |
| special-badges | 🟡 設計中 | 殿堂入り / 月間 TOP 10 専用の SVG バッジ + PNG 達成カード。/finish と生成を分離 + クライアント起点 + 自己修復。HoF は順位で配色（金/銀/銅/黒）、月間は青固定 | [./special-badges/README.md](./special-badges/README.md) |
| adsense | ✅ | 広告配信。Google AdSense のディスプレイ広告 | [./adsense/README.md](./adsense/README.md) |
| dev-login | ✅ | 開発用ログイン（既存） | [./dev-login/README.md](./dev-login/README.md) |
| shared-packages | ✅ | api/cron 横断で共通利用する `@repo/db` / `@repo/logger` / `@repo/errors` / `@repo/redis` の設計（テンプレート整備）。`@repo/config` は撤去済み（各 app の `src/env.ts` にインライン化） | [./shared-packages/README.md](./shared-packages/README.md) |

## ステータスの定義

- **設計中**: `docs/spec/{feature}/README.md` および `step*.md` を作成中。実装には未着手
- **実装中**: 設計が完了し、コードを実装中。一部の step が完了している場合もこのステータス
- **完了**: 全 step が実装され、テストが通っている

## 運用ルール

- 新機能を作るときは `design-feature` skill を使い、このファイルにエントリを必ず追加する
- ステータスが変わったらこのファイルも更新する
- 不要になった機能は削除し、過去の経緯を `docs/spec/{feature}/README.md` に記録してから機能ディレクトリ自体をアーカイブ（必要に応じて）
