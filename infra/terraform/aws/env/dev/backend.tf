# =============================================================================
# Remote Backend Configuration
# =============================================================================
# Bootstrapで作成されたS3バケットとDynamoDBテーブルを使用
#
# 注意: このファイルは変数を使用できないため、bootstrap実行後に手動で更新してください
#
# 手順:
# 1. bootstrap/variables.tfのs3_bucket_nameのデフォルト値を確認
# 2. 以下のbucket とdynamodb_tableの値を更新
# 3. terraform init を実行

terraform {
  backend "s3" {
    bucket         = "project-template-terraform-state-20250101" # TODO: backet名を適切な値に変更してください
    key            = "dev/terraform.tfstate"
    region         = "ap-northeast-1"
    dynamodb_table = "project-template-terraform-state-lock" # TODO: bootstrap/variables.tfと同じ値に変更してください
    encrypt        = true
  }
}
