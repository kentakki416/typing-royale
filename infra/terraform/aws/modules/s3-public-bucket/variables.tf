variable "bucket_name" {
  description = "S3 バケット名（グローバルで一意）"
  type        = string
}

variable "cors_allowed_origins" {
  description = "CORS で GET を許可する origin。公開アセットなので既定は全許可"
  type        = list(string)
  default     = ["*"]
}

variable "tags" {
  description = "リソースに付与するタグ"
  type        = map(string)
  default     = {}
}
