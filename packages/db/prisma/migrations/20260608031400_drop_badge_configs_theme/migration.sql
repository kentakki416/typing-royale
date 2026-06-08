-- DropColumn
-- badge_configs.theme は廃止し、SVG バッジは常に黒テーマで統一する
-- (docs/spec/rewards/README.md「動的 SVG バッジの配信戦略」)
ALTER TABLE "badge_configs" DROP COLUMN "theme";
