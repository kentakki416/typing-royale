# =============================================================================
# 公開読み取り S3 バケット（CORS 付き）モジュール
# =============================================================================
# README 等への埋め込み前提で GetObject を公開するアセット用。秘匿データは置かない。
# 公開・非機密・再生成可能なアセットを想定し、versioning / CMK は付けない。

# trivy:ignore:AVD-AWS-0090 再生成可能な公開アセット向けに versioning は不要（古い版が溜まるだけ）
# trivy:ignore:AVD-AWS-0132 公開・非機密データのため CMK は過剰。既定の SSE-S3 で十分
resource "aws_s3_bucket" "this" {
  bucket = var.bucket_name
  tags   = var.tags
}

# 公開バケットポリシーを許可するため public policy のブロックだけ外す（ACL は使わない）
# trivy:ignore:AVD-AWS-0087 公開読み取りポリシーを貼るため block_public_policy を意図的に false
# trivy:ignore:AVD-AWS-0093 公開バケットなので restrict_public_buckets を意図的に false
resource "aws_s3_bucket_public_access_block" "this" {
  bucket = aws_s3_bucket.this.id

  block_public_acls       = true
  block_public_policy     = false
  ignore_public_acls      = true
  restrict_public_buckets = false
}

# cross-origin fetch（例: フロントの blob ダウンロード）用の CORS
resource "aws_s3_bucket_cors_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET"]
    allowed_origins = var.cors_allowed_origins
    max_age_seconds = 3600
  }
}

# 誰でも GetObject 可能（公開前提）。秘匿情報は載せない
resource "aws_s3_bucket_policy" "public_read" {
  bucket     = aws_s3_bucket.this.id
  depends_on = [aws_s3_bucket_public_access_block.this]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.this.arn}/*"
      }
    ]
  })
}
