# =============================================================================
# Production Environment - Main Configuration
# =============================================================================
# 各リソースは dev と同じ modules/ を共用し、prd 向けに以下を厳格化している:
#   - VPC CIDR: 10.1.0.0/16 (dev=10.0.0.0/16 と非重複、将来 VPC peering 可能)
#   - Secrets recovery_window_in_days: 30 (誤削除に耐える)
#   - RDS: Multi-AZ / deletion_protection / final snapshot / backup 30 日
#   - ElastiCache: 2 ノード / Multi-AZ / Auto Failover / TLS
#   - ALB: HTTPS 化 (ACM ワイルドカード + Route53 A レコード)、deletion_protection=true
#   - ECS: Cluster + API (Blue/Green) + worker + migration + cron の 4 workload (+ EventBridge Scheduler)
#
# TODO (本 PR 範囲外、後続 step / 別 PR で対応):
#   - NAT Gateway を AZ 冗長化 (現状は modules/vpc が単一 NAT のみサポート)
#   - VPC Flow Logs を CloudWatch Logs に出力 (本 PR では未対応、.trivyignore で抑止)
#   - prd Required reviewers ゲート設定 (GitHub Settings → Environments → prd)

locals {
  # 基本設定
  name_prefix = "${var.project_name}-${var.environment}"

  /**
   * サブネット CIDR の計算
   * - public:   10.1.1.0/24, 10.1.2.0/24  (ALB / NAT Gateway 配置)
   * - private:  10.1.11.0/24, 10.1.12.0/24 (ECS task 配置、NAT 経由で outbound)
   * - isolated: 10.1.21.0/24, 10.1.22.0/24 (RDS / ElastiCache 配置)
   */
  public_subnet_cidrs   = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 1)]
  private_subnet_cidrs  = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 11)]
  isolated_subnet_cidrs = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 21)]

  /**
   * subnet キーは「<role><az-suffix>」の規約。dev と同じ規約に合わせる。
   * 例: public1-a / public1-c / private1-a / private1-c / isolated1-a / isolated1-c
   */
  public_subnet_keys   = [for az in var.availability_zones : "public${substr(az, length(az) - 2, 1)}-${substr(az, length(az) - 1, 1)}"]
  private_subnet_keys  = [for az in var.availability_zones : "private${substr(az, length(az) - 2, 1)}-${substr(az, length(az) - 1, 1)}"]
  isolated_subnet_keys = [for az in var.availability_zones : "isolated${substr(az, length(az) - 2, 1)}-${substr(az, length(az) - 1, 1)}"]

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    },
    var.additional_tags
  )
}

# =============================================================================
# ネットワーク設定 (VPC, サブネット, セキュリティグループ)
# =============================================================================

module "vpc" {
  source = "../../modules/vpc"

  # === 基本設定 ===
  name                    = local.name_prefix
  cidr_block              = var.vpc_cidr
  enable_dns_support      = true
  enable_dns_hostnames    = true
  create_internet_gateway = true
  create_nat_gateway      = true
  nat_gateway_subnet_key  = local.public_subnet_keys[0]

  # === サブネット設定 ===
  subnets = merge(
    /** public subnet: ALB + NAT Gateway 配置 */
    {
      for i, az in var.availability_zones :
      local.public_subnet_keys[i] => {
        cidr_block        = local.public_subnet_cidrs[i]
        availability_zone = az
        subnet_type       = "public"
      }
    },
    /** private subnet: ECS task 配置 */
    {
      for i, az in var.availability_zones :
      local.private_subnet_keys[i] => {
        cidr_block        = local.private_subnet_cidrs[i]
        availability_zone = az
        subnet_type       = "private"
      }
    },
    /** isolated subnet: RDS / ElastiCache 配置 (module 制約で subnet_type=private) */
    {
      for i, az in var.availability_zones :
      local.isolated_subnet_keys[i] => {
        cidr_block        = local.isolated_subnet_cidrs[i]
        availability_zone = az
        subnet_type       = "private"
      }
    },
  )

  # === セキュリティグループ定義 ===
  security_groups = {
    alb = {
      name        = "${local.name_prefix}-alb"
      description = "Security group for ALB"
    }
    ecs = {
      name        = "${local.name_prefix}-ecs"
      description = "Security group for ECS tasks"
    }
    rds = {
      name        = "${local.name_prefix}-rds"
      description = "Security group for RDS Postgres"
    }
    redis = {
      name        = "${local.name_prefix}-redis"
      description = "Security group for ElastiCache Redis"
    }
  }

  # === セキュリティグループルール ===
  security_group_rules = [
    # ALB Ingress - HTTPS は ACM 発行後に Step 3 PR で 443 へ追加するが、ACM 検証中の
    # ヘルスチェック / Cert 取得失敗時の動作確認のため HTTP も一旦許可しておく。
    {
      security_group_name = "alb"
      type                = "ingress"
      from_port           = 80
      to_port             = 80
      protocol            = "tcp"
      cidr_blocks         = ["0.0.0.0/0"]
      # NOTE: SG rule description は ASCII のみ許可 (AWS 制約)。日本語は使えない。
      # 意図: HTTPS 化 (ACM) 後はこの HTTP(80) 許可を外して ACM-only にする。
      description = "HTTP from internet (drop after enabling HTTPS/ACM)"
    },
    {
      security_group_name = "alb"
      type                = "ingress"
      from_port           = 443
      to_port             = 443
      protocol            = "tcp"
      cidr_blocks         = ["0.0.0.0/0"]
      description         = "HTTPS from internet"
    },
    # ALB Ingress - Blue/Greenテスト用リスナー（ポート9000、prd のみ）
    {
      security_group_name = "alb"
      type                = "ingress"
      from_port           = 9000
      to_port             = 9000
      protocol            = "tcp"
      cidr_blocks         = var.test_listener_allowed_cidrs
      description         = "Test listener for Blue/Green deployment"
    },
    # ALB Egress
    {
      security_group_name = "alb"
      type                = "egress"
      from_port           = 0
      to_port             = 0
      protocol            = "-1"
      cidr_blocks         = ["0.0.0.0/0"]
      description         = "All outbound traffic"
    },
    # ECS Ingress - ALBからのみアプリポートを受け付ける
    {
      security_group_name        = "ecs"
      type                       = "ingress"
      from_port                  = var.app_port
      to_port                    = var.app_port
      protocol                   = "tcp"
      source_security_group_name = "alb"
      description                = "From ALB only"
    },
    # ECS Egress - NAT 経由で外部 (ECR / Secrets Manager 等) へ
    {
      security_group_name = "ecs"
      type                = "egress"
      from_port           = 0
      to_port             = 0
      protocol            = "-1"
      cidr_blocks         = ["0.0.0.0/0"]
      description         = "All outbound traffic via NAT"
    },
    # RDS Ingress - ECS から 5432 のみ許可
    {
      security_group_name        = "rds"
      type                       = "ingress"
      from_port                  = 5432
      to_port                    = 5432
      protocol                   = "tcp"
      source_security_group_name = "ecs"
      description                = "Postgres from ECS"
    },
    # Redis Ingress - ECS から 6379 のみ許可
    {
      security_group_name        = "redis"
      type                       = "ingress"
      from_port                  = 6379
      to_port                    = 6379
      protocol                   = "tcp"
      source_security_group_name = "ecs"
      description                = "Redis from ECS"
    },
  ]
}

# =============================================================================
# アプリケーション機密 (Secrets Manager)
# =============================================================================
# - JWT 署名鍵は Terraform 内で random_password 生成し初回投入のみ行う
# - DATABASE_URL / REDIS_HOST / GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET / FRONTEND_URL は
#   後続 step で RDS / Redis を作った後、scripts/seed-secrets.sh 等で投入する
# - recovery_window_in_days = 30: prd は誤削除耐性を最大化

resource "random_password" "jwt_access_secret" {
  length  = 64
  special = false

  lifecycle {
    ignore_changes = [length, special, override_special, min_lower, min_upper, min_numeric, min_special]
  }
}

resource "random_password" "jwt_refresh_secret" {
  length  = 64
  special = false

  lifecycle {
    ignore_changes = [length, special, override_special, min_lower, min_upper, min_numeric, min_special]
  }
}

module "app_secrets" {
  source = "../../modules/secrets"

  name                    = "/${local.name_prefix}/app"
  recovery_window_in_days = 30

  initial_values = {
    JWT_ACCESS_SECRET      = random_password.jwt_access_secret.result
    JWT_REFRESH_SECRET     = random_password.jwt_refresh_secret.result
    JWT_ACCESS_EXPIRATION  = "15m"
    JWT_REFRESH_EXPIRATION = "30d"

    REDIS_PORT = "6379"
    REDIS_DB   = "0"

    NODE_ENV = "production"
    PORT     = "8080"

    /**
     * cron / worker が参照する値の「箱」を空文字で確保する placeholder。
     * 実値は apply 後に scripts/seed-secrets.sh で投入する:
     *   - REDIS_URL : worker が BullMQ 接続に使用 (prd は TLS なので rediss://)
     *   - GITHUB_PAT: cron crawler が GitHub API を叩くのに使用
     * 空のまま起動すると cron/worker は env 検証 (safeParse) で exit(1) するが、
     * キー自体が存在しないと「これらを参照しない api task」までもが
     * valueFrom 解決失敗で起動不能になる。それを防ぐためにキーだけ先に作る。
     */
    GITHUB_PAT = ""
    REDIS_URL  = ""
  }

  tags = local.common_tags
}

# =============================================================================
# RDS Postgres 16
# =============================================================================
# - isolated subnet (2 AZ) に配置、SG は ECS のみから 5432 許可
# - master password は AWS が自動生成し Secrets Manager に保存 (tfstate に残らない)
# - prd は Multi-AZ / deletion_protection / final snapshot を有効化
# - DATABASE_URL は apply 後に手動で /typing-royale-prd/app secret に追加する
#   (modules/secrets の ignore_changes により Terraform からは触れないため)

module "rds" {
  source = "../../modules/rds"

  name = "${local.name_prefix}-db"
  # メジャーバージョンのみ指定。auto_minor_version_upgrade=true なので AWS が
  # 利用可能な最新マイナーを選ぶ。マイナーピン留め (例: 16.6) は AWS が EOL で
  # 廃止すると create 時に "Cannot find version" で落ちるため避ける。
  engine_version    = "16"
  instance_class    = "db.t4g.micro"
  allocated_storage = 20
  storage_type      = "gp3"
  db_name           = "typing_royale"
  master_username   = "typingroyale"

  subnet_ids         = [for k in local.isolated_subnet_keys : module.vpc.subnets[k].id]
  security_group_ids = [module.vpc.security_groups["rds"].id]

  # prd: Multi-AZ 配置で AZ 障害耐性を確保
  multi_az = true

  # prd: 30 日間 PITR (Point-in-Time Recovery)
  backup_retention_period = 30

  # メンテ / バックアップ時間帯は JST 早朝 (UTC -9h) に寄せる
  # backup: JST 02:00-03:00 / maintenance: JST 日曜 03:00-04:00
  backup_window      = "17:00-18:00"
  maintenance_window = "sun:18:00-sun:19:00"

  # prd: メンテ時間帯まで変更を遅延 (apply_immediately=false)
  # これにより本番稼働中の予期せぬ再起動を防ぐ
  apply_immediately = false

  # prd: 誤削除防止 + destroy 時に final snapshot を取得
  deletion_protection = true
  skip_final_snapshot = false

  # Performance Insights 31 日保持 (無料枠)
  performance_insights_enabled          = true
  performance_insights_retention_period = 31

  tags = local.common_tags
}

# =============================================================================
# ElastiCache Redis 7
# =============================================================================
# - isolated subnet (2 AZ) に配置、SG は ECS のみから 6379 許可
# - prd は 2 ノード (primary + replica) / Multi-AZ / Auto Failover / TLS 有効化
# - REDIS_HOST は apply 後に scripts/seed-secrets.sh で Secrets Manager に投入する
#   TLS 有効のため接続文字列は rediss://<primary_endpoint>:6379 にすること

module "elasticache" {
  source = "../../modules/elasticache"

  name           = "${local.name_prefix}-redis"
  engine_version = "7.1"
  node_type      = "cache.t4g.micro"

  subnet_ids         = [for k in local.isolated_subnet_keys : module.vpc.subnets[k].id]
  security_group_ids = [module.vpc.security_groups["redis"].id]

  # prd: 2 ノード構成で Multi-AZ + Auto Failover を有効化
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  multi_az_enabled           = true

  # prd: snapshot 7 日保持
  snapshot_retention_limit = 7

  # prd: TLS in-transit を有効化 (クライアントは rediss:// で接続)
  transit_encryption_enabled = true

  # メンテ時間帯 (UTC)。AWS 仕様で snapshot_window と maintenance_window は overlap 不可
  # snapshot: 毎日 18:00-19:00 UTC (JST 03:00-04:00)
  # maintenance: 月曜 19:00-20:00 UTC (JST 月曜 04:00-05:00)
  snapshot_window    = "18:00-19:00"
  maintenance_window = "mon:19:00-mon:20:00"

  # prd: 即時適用しない (本番稼働中の予期せぬ再起動防止)
  apply_immediately = false

  tags = local.common_tags
}

# =============================================================================
# DNS / TLS (Route53 hosted zone lookup + ACM certificate)
# =============================================================================
# var.domain_name が空のときは ACM / Route53 を作らず ALB は HTTP のみで起動する。
# 値を入れると以下が一括作成される:
#   1. data "aws_route53_zone" で Route 53 Domains 購入時に自動作成された
#      hosted zone を lookup（Registrar 側の NS もこの zone を向くので追加の手動操作は不要）
#   2. ACM ワイルドカード証明書を DNS 検証で発行 (本番=*.<domain_name> / 非本番=*.<subdomain>.<domain_name>)
#   3. API の A レコード (ALB ALIAS) を作成 (本番=api.<domain_name> / 非本番=api.<subdomain>.<domain_name>)
#
# 前提:
#   - Route 53 Domains で var.domain_name を購入済み（apex zone は自動作成されている）
#   - var.domain_name を `terraform.tfvars` または `-var` で実ドメインに設定
#   - apply 後 ACM / DNS / HTTPS ALB が一括作成される

locals {
  dns_enabled = var.domain_name != ""

  # API の FQDN。subdomain が空 (本番) なら api.<domain>、値があれば api.<subdomain>.<domain>。
  #   - 本番: subdomain="" → api.typing-royale.com
  #   - stg : subdomain="stg" → api.stg.typing-royale.com
  api_fqdn = var.subdomain == "" ? "${var.api_subdomain}.${var.domain_name}" : "${var.api_subdomain}.${var.subdomain}.${var.domain_name}"
}

data "aws_route53_zone" "main" {
  count        = local.dns_enabled ? 1 : 0
  name         = var.domain_name
  private_zone = false
}

module "acm" {
  count  = local.dns_enabled ? 1 : 0
  source = "../../modules/acm"

  domain_name = var.domain_name
  subdomain   = var.subdomain
  zone_id     = data.aws_route53_zone.main[0].zone_id

  tags = local.common_tags
}

# =============================================================================
# Application Load Balancer
# =============================================================================
# - dns_enabled = true: HTTPS リスナー (443) + ACM 証明書、HTTP リスナー (80) なし
# - dns_enabled = false: HTTP リスナー (80) のみ (ACM 未準備の暫定構成)
# - test_listener (9000) は dns_enabled 不問で常に作成 (Blue/Green 検証用)
# - prd は deletion_protection=true で誤削除を防ぐ

module "alb" {
  source = "../../modules/alb"

  # === 基本設定 ===
  name            = "${local.name_prefix}-alb"
  vpc_id          = module.vpc.vpc_id
  security_groups = [module.vpc.security_groups["alb"].id]
  subnets         = [for k in local.public_subnet_keys : module.vpc.subnets[k].id]

  # === ターゲットグループ設定 ===
  target_group_name_prefix = "${local.name_prefix}-api"
  target_group_port        = var.app_port
  listener_port            = "80"

  # === HTTPS 化 ===
  enable_https    = local.dns_enabled
  certificate_arn = local.dns_enabled ? module.acm[0].certificate_arn : null

  # === idle_timeout ===
  # 現状 SSE / long-poll エンドポイントは無いため ALB デフォルト (60 秒) を使う。
  # 将来 stream 系を足すときに modules/alb の idle_timeout を延長する。

  # === Blue/Greenデプロイ設定 ===
  enable_blue_green = true

  # === prd: ALB 誤削除防止 ===
  enable_deletion_protection = true

  # === タグ設定 ===
  tags = merge(
    local.common_tags,
    {
      Name      = "${local.name_prefix}-alb"
      Component = "LoadBalancer"
    }
  )
}

# =============================================================================
# Route53 A レコード (API)
# =============================================================================
# <api_subdomain>.<subdomain>.<domain_name> → ALB の ALIAS
# dns_enabled = false のときは作成しない

module "route53_api" {
  count  = local.dns_enabled ? 1 : 0
  source = "../../modules/route53"

  zone_id      = data.aws_route53_zone.main[0].zone_id
  fqdn         = local.api_fqdn
  alb_dns_name = module.alb.alb_dns_name
  alb_zone_id  = module.alb.alb_zone_id
}

# =============================================================================
# コンテナレジストリ (ECR) - account/ で作成済みリポジトリを lookup
# =============================================================================

data "aws_ecr_repository" "api" {
  name = "${var.project_name}-api-server"
}

data "aws_ecr_repository" "worker" {
  name = "${var.project_name}-worker"
}

data "aws_ecr_repository" "migration" {
  name = "${var.project_name}-migration"
}

data "aws_ecr_repository" "cron" {
  name = "${var.project_name}-cron"
}

# =============================================================================
# ECS Fargate Cluster
# =============================================================================
# 全 workload (API / worker / migration / cron) が共有する cluster と task execution role を作る。

module "ecs_cluster" {
  source = "../../modules/ecs-cluster"

  name = "${local.name_prefix}-cluster"

  # Task execution role に Secrets Manager Get 権限を持たせる対象 ARN を渡す。
  secret_arns_readable = [module.app_secrets.secret_arn]

  tags = local.common_tags
}

# ECS workload の「デフォルト」共通設定。dev と同じ構造で workload 間の差分を最小化する。
locals {
  ecs_common = {
    cluster_arn        = module.ecs_cluster.cluster_arn
    execution_role_arn = module.ecs_cluster.task_execution_role_arn
    subnets            = [for k in local.private_subnet_keys : module.vpc.subnets[k].id]
    security_groups    = [module.vpc.security_groups["ecs"].id]
    secrets_arn        = module.app_secrets.secret_arn

    # Secrets Manager に登録している全環境変数を 1 箇所で集中管理。
    # 全 workload で同じ secret 集合を共有 (最小権限より「forget しない」事故防止を優先)。
    secret_keys = [
      "DATABASE_URL",
      "REDIS_HOST", "REDIS_PORT", "REDIS_DB", "REDIS_URL",
      "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET",
      "JWT_ACCESS_EXPIRATION", "JWT_REFRESH_EXPIRATION",
      "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GITHUB_PAT",
      "FRONTEND_URL", "NODE_ENV", "PORT",
    ]
  }
}

# =============================================================================
# Rewards 達成カード用 S3（公開読み取り）+ worker/api タスクロール
# =============================================================================
# worker(生成) と api(配信) が別 ECS コンテナ＝ filesystem 非共有のため、生成した
# 達成カード PNG を共有できる公開 S3 バケットを用意する。アプリ側は env REWARDS_STORAGE=s3
# で S3 を選択する（@repo/storage）。

module "rewards_bucket" {
  source = "../../modules/s3-public-bucket"

  bucket_name = "${local.name_prefix}-rewards"
  tags        = local.common_tags
}

# worker / api が PNG を Put / Delete するためのタスクロール（両 workload で共有）
resource "aws_iam_role" "rewards_task" {
  name = "${local.name_prefix}-rewards-task"
  tags = local.common_tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "ecs-tasks.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "rewards_task_s3" {
  name = "rewards-s3-write"
  role = aws_iam_role.rewards_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:DeleteObject"]
        Resource = "${module.rewards_bucket.arn}/*"
      }
    ]
  })
}

# worker / api workload に渡す S3 ストレージ用の環境変数（下の module で参照）
locals {
  rewards_s3_environment = {
    AWS_REGION              = var.aws_region
    REWARDS_PUBLIC_URL_BASE = module.rewards_bucket.public_url_base
    REWARDS_S3_BUCKET       = module.rewards_bucket.bucket
    REWARDS_STORAGE         = "s3"
  }
}

# =============================================================================
# ECS Workload: API (Express on Fargate, ALB + Blue/Green デプロイ)
# =============================================================================
# prd: desired_count = 2 で AZ 冗長確保 + ローリングデプロイ余裕

module "ecs_api" {
  source = "../../modules/ecs-workload"

  name           = "${local.name_prefix}-api"
  image          = "${data.aws_ecr_repository.api.repository_url}:latest"
  cpu            = tonumber(var.ecs_task_cpu)
  memory         = tonumber(var.ecs_task_memory)
  container_port = var.app_port
  desired_count  = var.ecs_api_desired_count

  cluster_arn        = local.ecs_common.cluster_arn
  execution_role_arn = local.ecs_common.execution_role_arn
  subnets            = local.ecs_common.subnets
  security_groups    = local.ecs_common.security_groups

  secrets_arn = local.ecs_common.secrets_arn
  secret_keys = local.ecs_common.secret_keys

  # S3 達成カードストレージ（rewards-storage.tf）。worker と同じ asset_url を生成する
  task_role_arn = aws_iam_role.rewards_task.arn
  environment   = local.rewards_s3_environment

  # ALB + Blue/Green
  target_group_arn             = module.alb.target_group_a_arn
  enable_blue_green            = true
  alternate_target_group_arn   = module.alb.target_group_b_arn
  production_listener_rule_arn = module.alb.listener_rule_arn
  test_listener_rule_arn       = module.alb.test_listener_rule_arn
  bake_time_in_minutes         = 10 # prd は dev (5 分) より長めに様子見

  log_retention_in_days = var.log_retention_days
  tags                  = local.common_tags
}

# =============================================================================
# ECS Workload: worker (generate-reward BullMQ ジョブ消化、ALB なし、Blue/Green なし)
# =============================================================================

module "ecs_worker" {
  source = "../../modules/ecs-workload"

  name   = "${local.name_prefix}-worker"
  image  = "${data.aws_ecr_repository.worker.repository_url}:latest"
  cpu    = 256
  memory = 512

  cluster_arn        = local.ecs_common.cluster_arn
  execution_role_arn = local.ecs_common.execution_role_arn
  subnets            = local.ecs_common.subnets
  security_groups    = local.ecs_common.security_groups

  secrets_arn = local.ecs_common.secrets_arn
  secret_keys = local.ecs_common.secret_keys

  # S3 達成カードストレージ（rewards-storage.tf）。生成した PNG を S3 に保存する
  task_role_arn = aws_iam_role.rewards_task.arn
  environment   = local.rewards_s3_environment

  # 先に ECR へ image を push してから apply する前提で 1 固定。
  # image が未 push の状態で apply すると ECS task が CannotPullContainerError で
  # 失敗するが、deploy workflow から image を push + task definition 更新すれば
  # ECS が自動で再 pull して正常化するため、運用上は問題にしない。
  desired_count         = 1
  log_retention_in_days = var.log_retention_days
  tags                  = local.common_tags
}

# =============================================================================
# ECS Workload: Prisma migration (one-shot task definition、Service なし)
# =============================================================================
# - GHA から `aws ecs run-task --task-definition <family>` で起動する想定
# - 専用 ECR (typing-royale-migration) + 専用 Dockerfile (packages/db/Dockerfile.migration) を使う
# - Dockerfile の CMD = `prisma migrate deploy --schema=prisma/schema.prisma` をそのまま使う

module "ecs_migration" {
  source = "../../modules/ecs-workload"

  name   = "${local.name_prefix}-migration"
  image  = "${data.aws_ecr_repository.migration.repository_url}:latest"
  cpu    = 256
  memory = 512

  cluster_arn        = local.ecs_common.cluster_arn
  execution_role_arn = local.ecs_common.execution_role_arn
  subnets            = local.ecs_common.subnets
  security_groups    = local.ecs_common.security_groups

  secrets_arn = local.ecs_common.secrets_arn
  secret_keys = local.ecs_common.secret_keys

  create_service        = false
  log_retention_in_days = var.log_retention_days
  tags                  = local.common_tags
}

# =============================================================================
# ECS Workload: cron (crawler / batch、常駐 service なし)
# =============================================================================
# - service は作らず task definition だけを用意する (create_service = false)。
#   起動は EventBridge Scheduler (modules/ecs-scheduled-task) が発火時に RunTask する。
# - 1 つの cron image を複数スケジュールで共有し、起動コマンドは schedule 側の
#   command override (= RunTask containerOverrides) で切り替える。
# - deploy workflow はこの family を describe → image を SHA に差し替えて新リビジョン
#   register する (migration と同じ運用)。schedule は family ARN (revision なし) を
#   参照するので latest を自動追従する。

module "ecs_cron" {
  source = "../../modules/ecs-workload"

  name   = "${local.name_prefix}-cron"
  image  = "${data.aws_ecr_repository.cron.repository_url}:latest"
  cpu    = 256
  memory = 512

  cluster_arn        = local.ecs_common.cluster_arn
  execution_role_arn = local.ecs_common.execution_role_arn
  subnets            = local.ecs_common.subnets
  security_groups    = local.ecs_common.security_groups

  secrets_arn = local.ecs_common.secrets_arn
  secret_keys = local.ecs_common.secret_keys

  create_service        = false
  log_retention_in_days = var.log_retention_days
  tags                  = local.common_tags
}

# =============================================================================
# EventBridge Scheduler: cron スケジュール
# =============================================================================
# 稼働中の 4 タスクのみ登録する (batch:ranking は未実装スタブのため別 PR)。
#   - crawler:run:typescript  : 週次 月曜 03:00 JST
#   - crawler:run:javascript  : 週次 月曜 04:30 JST
#   - crawler:run:go          : 週次 月曜 06:00 JST
#   - crawler:license-recheck : 月初 1 日 04:00 JST
# すべて JST (Asia/Tokyo) 基準。command は dist/task/<name>.js を直接起動する。

module "schedule_crawler_typescript" {
  source = "../../modules/ecs-scheduled-task"

  name                = "${local.name_prefix}-crawler-typescript"
  schedule_expression = "cron(0 3 ? * MON *)" # 毎週月曜 03:00 JST

  cluster_arn            = module.ecs_cluster.cluster_arn
  task_definition_family = module.ecs_cron.task_definition_family
  execution_role_arn     = module.ecs_cluster.task_execution_role_arn

  subnets         = local.ecs_common.subnets
  security_groups = local.ecs_common.security_groups

  container_name = "${local.name_prefix}-cron"
  command        = ["node", "dist/task/crawler-run-typescript.js"]

  tags = local.common_tags
}

module "schedule_crawler_javascript" {
  source = "../../modules/ecs-scheduled-task"

  name                = "${local.name_prefix}-crawler-javascript"
  schedule_expression = "cron(30 4 ? * MON *)" # 毎週月曜 04:30 JST (TS とずらす)

  cluster_arn            = module.ecs_cluster.cluster_arn
  task_definition_family = module.ecs_cron.task_definition_family
  execution_role_arn     = module.ecs_cluster.task_execution_role_arn

  subnets         = local.ecs_common.subnets
  security_groups = local.ecs_common.security_groups

  container_name = "${local.name_prefix}-cron"
  command        = ["node", "dist/task/crawler-run-javascript.js"]

  tags = local.common_tags
}

module "schedule_crawler_go" {
  source = "../../modules/ecs-scheduled-task"

  name                = "${local.name_prefix}-crawler-go"
  schedule_expression = "cron(0 6 ? * MON *)" # 毎週月曜 06:00 JST (TS/JS とずらす)

  cluster_arn            = module.ecs_cluster.cluster_arn
  task_definition_family = module.ecs_cron.task_definition_family
  execution_role_arn     = module.ecs_cluster.task_execution_role_arn

  subnets         = local.ecs_common.subnets
  security_groups = local.ecs_common.security_groups

  container_name = "${local.name_prefix}-cron"
  command        = ["node", "dist/task/crawler-run-go.js"]

  tags = local.common_tags
}

module "schedule_license_recheck" {
  source = "../../modules/ecs-scheduled-task"

  name                = "${local.name_prefix}-license-recheck"
  schedule_expression = "cron(0 4 1 * ? *)" # 毎月 1 日 04:00 JST

  cluster_arn            = module.ecs_cluster.cluster_arn
  task_definition_family = module.ecs_cron.task_definition_family
  execution_role_arn     = module.ecs_cluster.task_execution_role_arn

  subnets         = local.ecs_common.subnets
  security_groups = local.ecs_common.security_groups

  container_name = "${local.name_prefix}-cron"
  command        = ["node", "dist/task/crawler-license-recheck.js"]

  tags = local.common_tags
}
