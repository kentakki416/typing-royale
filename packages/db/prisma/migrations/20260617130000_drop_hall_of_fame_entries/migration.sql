-- Hall of Fame コメント機能を廃止したため hall_of_fame_entries テーブルを drop する。
-- ranking 表示 (殿堂入り画面) は user_language_best からリアルタイム集計するため、本テーブルへの依存は無い。
DROP TABLE IF EXISTS "hall_of_fame_entries";
