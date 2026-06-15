## 概要
本プロジェクトのTerraformによるIaCディレクトリ

### 外部ツール
- **[Trivy](https://trivy.dev/)**: Aqua Security製のOSSセキュリティスキャナ。Terraform設定ファイルのミスコンフィグや脆弱性を検出する
- **[TFLint](https://github.com/terraform-linters/tflint)**: Terraform専用のリンター。非推奨構文やプロバイダ固有のルール違反を検出する

## ディレクトリ構成

```
terraform/
├── aws/
│   ├── bootstrap/        # S3 バックエンド（state lock は S3 ネイティブの use_lockfile、初回のみ apply、local state）
│   ├── account/          # OIDC provider・GitHub Actions IAM role・ECR（AWS アカウント単位で共有）
│   ├── env/
│   │   ├── dev/          # 開発環境の設定
│   │   └── prd/          # 本番環境の設定
│   └── modules/          # 再利用可能なモジュール群（alb / ecs-cluster / ecs-workload / vpc 等）
├── .tflint.hcl           # TFLint設定
└── README.md
```

## クイックスタート

### 必要なツールのインストール

```bash
brew install terraform tflint trivy
```

### セットアップ

```bash
# AWS認証（管理者からシークレット情報を取得して設定）
aws configure
export AWS_DEFAULT_REGION="ap-northeast-1"
```

#### 1. Bootstrap（初回のみ）

tfstate を管理するための S3 バケットを作成します。state lock は Terraform 1.10+ の S3 ネイティブロック（`use_lockfile = true`）で取得するため、DynamoDB テーブルは作りません。

```bash
cd aws/bootstrap

# 1. variables.tf の以下のデフォルト値をプロジェクトに合わせて変更
#    - project_name
#    - s3_bucket_name（AWS グローバルで一意にする）

# 2. リソースを作成
terraform init
terraform plan
terraform apply
```

#### 2. Backend設定

Bootstrap で作成したリソースを環境側の backend に反映します。

```bash
cd aws/env/dev

# backend.tf の以下の値を Bootstrap で作成した値に更新
#   - bucket（= bootstrap の s3_bucket_name）

terraform init
```

#### 3. Account（初回はローカル apply 必須）

`account/` は GitHub Actions が assume する IAM role 自身を管理しているため、**初回および role を rename/replace する変更はローカルから apply** する。CI から流すと自分自身の role を書き換えて assume できなくなる。

```bash
cd aws/account
terraform init
terraform plan
terraform apply

# apply 後、新しい dev role の ARN を取得して
# GitHub Settings → Environments → dev → Secrets の AWS_ROLE_ARN を再登録する
terraform output -raw github_actions_dev_role_arn
```

secret 更新後は次回以降の account 変更を `terraform-aws-account-apply.yml`（workflow_dispatch）から普通に実行できる。

#### 4. リソースのデプロイ
リソースをデプロイします。詳細は以下のインフラ図を参照してください。
- [AWS インフラ構成図](./aws-infrastructure.drawio)

```bash
cd aws/env/dev

terraform plan
terraform apply
```

## コマンド集

```bash
# --- デプロイ関連 ---
cd aws/env/dev
terraform plan      # 差分検知
terraform apply     # デプロイ
terraform destroy   # 削除

# --- リント・バリデーション ---
terraform fmt -check -recursive -diff                                    # フォーマットチェック
terraform validate                                                       # バリデーション（aws/env/dev内で実行）
tflint --init                                                            # TFLint初期化（初回のみ）
tflint --chdir=aws/env/dev --config=$(pwd)/.tflint.hcl --recursive      # TFLintチェック

# --- セキュリティスキャン ---
trivy config aws/env/dev -c aws/env/dev/.trivy.yml                      # Trivy 脆弱性・ミスコンフィグチェック(devはコスト削減のため、.trivyignoreでいくつかのチェックを無効化している)
trivy config aws/env/prd -c aws/env/dev/.trivy.yml                      # Trivy 脆弱性・ミスコンフィグチェック
```
