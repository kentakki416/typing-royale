# =============================================================================
# Remote Backend Configuration
# =============================================================================
# bootstrap で作成済みの S3 バケット / DynamoDB ロックテーブルを共用し、
# key だけ prd 用に分離する。
#
# 手順:
# 1. bootstrap/variables.tf の s3_bucket_name / dynamodb_table_name を確認
# 2. 下記の bucket / dynamodb_table の値を実際の bootstrap 出力値に合わせる
# 3. terraform init -backend-config=... 不要 (この HCL の値を直接使用)

terraform {
  backend "s3" {
    bucket         = "project-template-terraform-state-20250101" # TODO: bootstrap で作成した実際の bucket 名に変更してください
    key            = "prd/terraform.tfstate"
    region         = "ap-northeast-1"
    dynamodb_table = "project-template-terraform-state-lock" # TODO: bootstrap で作成した実際のテーブル名に変更してください
    encrypt        = true
  }
}
