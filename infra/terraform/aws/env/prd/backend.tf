# =============================================================================
# Remote Backend Configuration
# =============================================================================
# bootstrap で作成済みの S3 バケットを共用し、key だけ prd 用に分離する。
# State lock は S3 ネイティブの use_lockfile を使う (Terraform 1.10+)。

terraform {
  backend "s3" {
    bucket       = "typing-royale-terraform-state-20260614"
    key          = "prd/terraform.tfstate"
    region       = "ap-northeast-1"
    use_lockfile = true
    encrypt      = true
  }
}
