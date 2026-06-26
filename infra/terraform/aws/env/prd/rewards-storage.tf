# =============================================================================
# Rewards 達成カード PNG 用 S3 バケット（公開読み取り）
# =============================================================================
# worker / api は別 ECS コンテナで filesystem を共有できないため、worker が生成した
# 達成カード PNG を S3 に保存し、公開 URL で配信する。カードは README 埋め込み前提で
# 公開読み取り（秘匿情報は載せない）。worker / api は env REWARDS_STORAGE=s3 で切り替える。

# trivy:ignore:AVD-AWS-0090 達成カードは決定的・再生成可能なので versioning 不要（古い版が溜まるだけ）
# trivy:ignore:AVD-AWS-0132 公開・非機密の画像のみ。CMK は過剰で、既定の SSE-S3 で十分
resource "aws_s3_bucket" "rewards" {
  bucket = "${local.name_prefix}-rewards"
  tags   = local.common_tags
}

# 公開バケットポリシーを許可するため public policy のブロックだけ外す（ACL は使わない）。
# 0087/0093 はカードを README 埋め込み用に公開する意図そのものなので許容する
# trivy:ignore:AVD-AWS-0087 公開読み取りポリシーを貼るため block_public_policy を意図的に false
# trivy:ignore:AVD-AWS-0093 公開バケットなので restrict_public_buckets を意図的に false
resource "aws_s3_bucket_public_access_block" "rewards" {
  bucket = aws_s3_bucket.rewards.id

  block_public_acls       = true
  block_public_policy     = false
  ignore_public_acls      = true
  restrict_public_buckets = false
}

# 誰でも GetObject 可能（カードは公開前提）。秘匿情報は載せない
resource "aws_s3_bucket_policy" "rewards_public_read" {
  bucket     = aws_s3_bucket.rewards.id
  depends_on = [aws_s3_bucket_public_access_block.rewards]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.rewards.arn}/*"
      }
    ]
  })
}

# worker / api が PNG を Put / Delete するためのタスクロール（両 workload で共有）
resource "aws_iam_role" "rewards_task" {
  name = "${local.name_prefix}-rewards-task"
  tags = local.common_tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "ecs-tasks.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "rewards_task_s3" {
  name = "rewards-s3-write"
  role = aws_iam_role.rewards_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.rewards.arn}/*"
      }
    ]
  })
}

# worker / api workload に渡す S3 ストレージ用の環境変数（main.tf の module で参照）
locals {
  rewards_s3_environment = {
    AWS_REGION              = var.aws_region
    REWARDS_PUBLIC_URL_BASE = "https://${aws_s3_bucket.rewards.bucket}.s3.${var.aws_region}.amazonaws.com"
    REWARDS_S3_BUCKET       = aws_s3_bucket.rewards.bucket
    REWARDS_STORAGE         = "s3"
  }
}
