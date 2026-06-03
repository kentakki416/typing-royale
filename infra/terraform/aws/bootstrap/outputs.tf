# =============================================================================
# Bootstrap Outputs
# =============================================================================

# Terraform State
output "s3_bucket_name" {
  description = "Terraform State 保存用の S3 バケット名"
  value       = aws_s3_bucket.terraform_state.id
}

output "dynamodb_table_name" {
  description = "Terraform State Lock 用の DynamoDB テーブル名"
  value       = aws_dynamodb_table.terraform_state_lock.name
}

output "aws_region" {
  description = "AWS リージョン"
  value       = var.aws_region
}
