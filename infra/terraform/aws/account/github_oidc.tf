# =============================================================================
# CI/CD設定 (GitHub Actions OIDC)
# =============================================================================
# GitHub Actions から OIDC 認証で AWS リソースにアクセス
# AWS アカウントに 1 つだけ OIDC provider を作成し、IAM role は env (dev / prd) ごとに分離する。
# 各 role の trust policy は `environment:<env>` の OIDC sub claim でのみ assume を許可する。

data "aws_caller_identity" "current" {}

# GitHub OIDC プロバイダー
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com" # Github Actions OIDCトークン発行元URL
  client_id_list  = ["sts.amazonaws.com"]                         # OIDCトークンのaudience（対象者）
  thumbprint_list = ["ffffffffffffffffffffffffffffffffffffffff"]  # ダミーデータでOK
}

/**
 * dev 環境用 GitHub Actions IAM ロール。
 *
 * trust policy は GitHub Environment が dev のワークフローからのみ assume できるよう
 * sub claim を `repo:<owner>/<repo>:environment:dev` に限定する。env/dev の apply と
 * account の apply の両方でこの role を使用する。
 */
resource "aws_iam_role" "github_actions_dev" {
  name = "${var.project_name}-github-actions-dev"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          # dev 系の GitHub Environment 全部を許可する。
          # - dev: 通常の deploy/CI job 用
          # - dev-api-approval: deploy workflow の approve-api job (Required reviewers ゲート) 用
          # 新しい dev 系 Environment を作る時はここに追加する。
          StringLike = {
            "token.actions.githubusercontent.com:sub" = [
              "repo:${var.github_repository}:environment:dev",
              "repo:${var.github_repository}:environment:dev-api-approval",
            ]
          }
        }
      }
    ]
  })
}

/**
 * prd 環境用 GitHub Actions IAM ロール（先行作成）。
 *
 * prd Environment が GitHub Settings に作成され、Required reviewers などのゲートが
 * 設定された後に、env/prd 用のワークフローからこの role を使う。trust policy は
 * `environment:prd` に限定。dev と違い AdminAccess は **意図的に付けない** ことで
 * 最小権限を強制する。当面 scoped policy (ecr_push + ecs_deploy) のみで足りない場合は、
 * env/prd の terraform plan/apply に必要な action を CloudTrail から抽出して scoped
 * policy を拡充していくこと。
 */
resource "aws_iam_role" "github_actions_prd" {
  name = "${var.project_name}-github-actions-prd"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:prd"
          }
        }
      }
    ]
  })
}

# ECR プッシュポリシー
resource "aws_iam_policy" "ecr_push" {
  name        = "${var.project_name}-ecr-push"
  description = "Policy for pushing images to ECR from GitHub Actions"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:BatchImportLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart"
        ]
        Resource = [
          aws_ecr_repository.api.arn,
          aws_ecr_repository.worker.arn,
          aws_ecr_repository.migration.arn,
        ]
      }
    ]
  })
}

# ECS デプロイ用ポリシー
resource "aws_iam_policy" "ecs_deploy" {
  name        = "${var.project_name}-ecs-deploy"
  description = "Policy for deploying to ECS from GitHub Actions"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecs:DescribeServices",
          "ecs:DescribeTaskDefinition",
          "ecs:DescribeTasks",
          "ecs:RegisterTaskDefinition",
          "ecs:RunTask",
          "ecs:UpdateService",
        ]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.project_name}-*-execution-role"
      },
      {
        /**
         * migration RunTask 失敗時のログ取得用 (step8 deploy-aws-dev workflow)
         */
        Effect = "Allow"
        Action = [
          "logs:FilterLogEvents",
        ]
        Resource = "arn:aws:logs:*:${data.aws_caller_identity.current.account_id}:log-group:/ecs/${var.project_name}-*"
      },
    ]
  })
}

# =============================================================================
# dev role への policy attachment
# =============================================================================

resource "aws_iam_role_policy_attachment" "ecr_push_dev" {
  role       = aws_iam_role.github_actions_dev.name
  policy_arn = aws_iam_policy.ecr_push.arn
}

resource "aws_iam_role_policy_attachment" "ecs_deploy_dev" {
  role       = aws_iam_role.github_actions_dev.name
  policy_arn = aws_iam_policy.ecs_deploy.arn
}

# GitHub Actions から terraform plan / apply を実行するために AdministratorAccess を attach。
# plan は管理対象リソースの read、apply は read/write がそれぞれ必要で、追加するたびに
# policy を細かく更新していくのは dev では運用負荷が大きいため admin で運用する。
#
# 含まれる権限:
# - tfstate アクセス (S3 + DynamoDB)
# - VPC / EC2 / ALB / ECS / ECR / RDS / ElastiCache / Route53 / ACM /
#   Secrets Manager / CloudWatch Logs / IAM など、step1〜10 で必要になる全リソース
#
# TODO: prd 環境の運用開始タイミングで CloudTrail から実使用 action を抽出して
#       scoped policy を作成し、prd / dev 両方をそちらに切り替えて本 attachment は剥がす。
resource "aws_iam_role_policy_attachment" "github_actions_admin_dev" {
  role       = aws_iam_role.github_actions_dev.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# =============================================================================
# prd role への policy attachment
# =============================================================================
# prd は AdminAccess を attach せず scoped policy のみで運用する。env/prd の plan / apply
# を回す際に不足する権限があれば、scoped policy 側を拡充して対応する（最小権限の強制）。

resource "aws_iam_role_policy_attachment" "ecr_push_prd" {
  role       = aws_iam_role.github_actions_prd.name
  policy_arn = aws_iam_policy.ecr_push.arn
}

resource "aws_iam_role_policy_attachment" "ecs_deploy_prd" {
  role       = aws_iam_role.github_actions_prd.name
  policy_arn = aws_iam_policy.ecs_deploy.arn
}
