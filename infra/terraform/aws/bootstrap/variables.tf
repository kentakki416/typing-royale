# =============================================================================
# Bootstrap Variables
# =============================================================================

variable "project_name" {
  description = "プロジェクト名（S3バケット名のプレフィックスに使用）"
  type        = string
  default     = "typing-royale"
}

variable "aws_region" {
  description = "AWSリージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "s3_bucket_name" {
  description = "Terraform State保存用のS3バケット名（AWS全体でグローバルに一意である必要があります。他のAWSアカウントで既に使用されている名前は使用できません）"
  type        = string
  default     = "typing-royale-terraform-state-20260614"
}
