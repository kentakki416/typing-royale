output "arn" {
  description = "バケットの ARN"
  value       = aws_s3_bucket.this.arn
}

output "bucket" {
  description = "バケット名"
  value       = aws_s3_bucket.this.bucket
}

output "public_url_base" {
  description = "オブジェクト公開 URL のベース（https://<bucket>.s3.<region>.amazonaws.com）"
  value       = "https://${aws_s3_bucket.this.bucket_regional_domain_name}"
}
