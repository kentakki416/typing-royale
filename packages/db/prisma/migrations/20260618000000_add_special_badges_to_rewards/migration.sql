-- special-badges 機能のための rewards テーブル拡張
-- docs/spec/special-badges/step1-db-rewards-special.md 参照
--
-- 変更点:
--   1. asset_svg_url カラムを追加 (SVG 文字列 or CDN URL)
--   2. type ごとのユニーク制約を部分インデックスで定義
--      - hall_of_fame_in: (user_id, type, language) で 1 行
--      - monthly_top_ten: (user_id, type, language, year_month) で 1 行
--
-- 既存 grade_up 行は影響なし (制約対象外)

-- AlterTable
ALTER TABLE "rewards" ADD COLUMN "asset_svg_url" TEXT;

-- 部分ユニークインデックス: HoF 入賞バッジは言語ごとに 1 行のみ
-- 順位が変動した場合は同じ行を update する設計
CREATE UNIQUE INDEX "rewards_hof_unique"
  ON "rewards" (user_id, type, (payload ->> 'language'))
  WHERE type = 'hall_of_fame_in';

-- 部分ユニークインデックス: 月間 TOP 10 バッジは言語 × 月ごとに 1 行のみ
CREATE UNIQUE INDEX "rewards_monthly_unique"
  ON "rewards" (user_id, type, (payload ->> 'language'), (payload ->> 'year_month'))
  WHERE type = 'monthly_top_ten';
