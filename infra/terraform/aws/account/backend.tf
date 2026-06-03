# =============================================================================
# Remote Backend Configuration
# =============================================================================
# bootstrap で作成された S3 バケットと DynamoDB テーブルを使用する。
# bootstrap apply 後に bucket / dynamodb_table を実値で更新すること。

terraform {
  backend "s3" {
    bucket         = "project-template-terraform-state-20250101"
    key            = "account/terraform.tfstate"
    region         = "ap-northeast-1"
    dynamodb_table = "project-template-terraform-state-lock"
    encrypt        = true
  }
}
