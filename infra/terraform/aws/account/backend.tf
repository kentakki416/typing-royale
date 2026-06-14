# =============================================================================
# Remote Backend Configuration
# =============================================================================
# bootstrap で作成された S3 バケットと DynamoDB テーブルを使用する。
# bootstrap apply 後に bucket / dynamodb_table を実値で更新すること。

terraform {
  backend "s3" {
    bucket         = "typing-royale-terraform-state-20260614"
    key            = "account/terraform.tfstate"
    region         = "ap-northeast-1"
    dynamodb_table = "typing-royale-terraform-state-lock"
    encrypt        = true
  }
}
