-- rewards-worker (step3 で apps/worker 化) のためのステータスカラムを追加する
-- 詳細: docs/spec/rewards-worker/step2-db-generation-status.md
--
-- 取り得る値:
--   pending    : INSERT 直後の初期値。worker が処理を開始する前
--   processing : worker が generateReward を実行中
--   completed  : SVG / PNG 生成 + storage save が成功し asset_url / asset_svg_url が確定
--   failed     : BullMQ attempts=3 を超えた最終失敗。UI には表示せず将来の再生成用に保持

-- AlterTable
ALTER TABLE "rewards"
  ADD COLUMN "generation_status" TEXT NOT NULL DEFAULT 'pending';

-- 既存行 (本番に存在する grade_up カード) は asset_url が埋まっているので completed として扱う。
-- これで step4 の見逃し popup 判定でも完成済として正しく動作する
UPDATE "rewards"
  SET "generation_status" = 'completed'
  WHERE "asset_url" IS NOT NULL;

-- step4 でホーム画面が「直近 7 日 + completed」を SELECT するためのインデックス
CREATE INDEX "rewards_user_id_generation_status_granted_at_idx"
  ON "rewards" ("user_id", "generation_status", "granted_at" DESC);
