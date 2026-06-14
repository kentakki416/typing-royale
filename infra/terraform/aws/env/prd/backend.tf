# =============================================================================
# Remote Backend Configuration
# =============================================================================
# bootstrap で作成済みの S3 バケット / DynamoDB ロックテーブルを共用し、
# key だけ prd 用に分離する。

terraform {
  backend "s3" {
    bucket         = "typing-royale-terraform-state-20260614"
    key            = "prd/terraform.tfstate"
    region         = "ap-northeast-1"
    dynamodb_table = "typing-royale-terraform-state-lock"
    encrypt        = true
  }
}
