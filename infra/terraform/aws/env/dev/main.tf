# =============================================================================
# Dev Environment - Main Configuration
# =============================================================================

# 共通設定とローカル変数
locals {
  # 基本設定
  name_prefix = "${var.project_name}-${var.environment}"

  /**
   * サブネット CIDR の計算
   * - public:   10.0.1.0/24, 10.0.2.0/24  (ALB / NAT Gateway 配置)
   * - private:  10.0.11.0/24, 10.0.12.0/24 (ECS task 配置、NAT 経由で outbound)
   * - isolated: 10.0.21.0/24, 10.0.22.0/24 (RDS / ElastiCache 配置)
   *
   * modules/vpc は public/private しか subnet_type を持たないため isolated も "private" 扱いとし、
   * 結果的に NAT route table に紐付くが RDS/Redis は outbound を開始しないため問題なし。
   */
  public_subnet_cidrs   = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 1)]
  private_subnet_cidrs  = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 11)]
  isolated_subnet_cidrs = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 21)]

  /**
   * subnet キーは「<role><az-suffix>」の規約。既存の public 命名と整合させる。
   * 例: public1-a / public1-c / private1-a / private1-c / isolated1-a / isolated1-c
   */
  public_subnet_keys   = [for az in var.availability_zones : "public${substr(az, length(az) - 2, 1)}-${substr(az, length(az) - 1, 1)}"]
  private_subnet_keys  = [for az in var.availability_zones : "private${substr(az, length(az) - 2, 1)}-${substr(az, length(az) - 1, 1)}"]
  isolated_subnet_keys = [for az in var.availability_zones : "isolated${substr(az, length(az) - 2, 1)}-${substr(az, length(az) - 1, 1)}"]

  # 共通タグ
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

# VPCモジュール呼び出し
# - public (ALB / NAT) / private (ECS) / isolated (RDS / Redis) の 3 階層
# - NAT Gateway 1 個（dev コスト優先）
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
    # ALB Ingress - インターネットからHTTPを受け付ける
    {
      security_group_name = "alb"
      type                = "ingress"
      from_port           = 80
      to_port             = 80
      protocol            = "tcp"
      cidr_blocks         = ["0.0.0.0/0"]
      description         = "HTTP from internet"
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
    # ECS Egress - NAT 経由で外部 (ECR / Secrets Manager / LiveKit Cloud) へ
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

# JWT 署名鍵 (Access / Refresh) は Terraform 内で自動生成して Secrets Manager に投入する。
# 外部から提供される値ではないので random_password で十分。
# tfstate に値が残るが、S3 KMS 暗号化で保護される前提。
#
# 鍵が変わると既存トークンが全部 invalid になりユーザーが一斉ログアウトするため、
# 引数 (length / special 等) の意図しない変更で再生成されないよう ignore_changes でガード。
# 意図的に rotate したいときは `terraform taint random_password.jwt_xxx_secret` を使う。
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

# Application secrets
# 「箱だけ Terraform で管理 + JWT のみ初回投入」方針:
# - 初回 apply で JWT (random_password) と基本定数のみ Secrets Manager に書く
# - 以降は modules/secrets 側の ignore_changes で Terraform は secret_string に触らない
# - DATABASE_URL / REDIS_HOST / GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET / FRONTEND_URL は scripts/seed-secrets.sh で投入
# - JWT を rotate するときは `terraform taint random_password.jwt_xxx` 後、
#   Secrets Manager Console で JWT_ACCESS_SECRET / JWT_REFRESH_SECRET を新値で上書き
#
# recovery_window_in_days = 0: dev は気軽に destroy/apply できるよう即時削除設定。
# prd では 7 以上にして誤削除に備えること。
module "app_secrets" {
  source = "../../modules/secrets"

  name                    = "/${local.name_prefix}/app"
  recovery_window_in_days = 0

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
     *   - REDIS_URL : worker が BullMQ 接続に使用 (dev は TLS なしなので redis://)
     *   - GITHUB_PAT: cron crawler が GitHub API を叩くのに使用
     * キーだけ先に作ることで、これらを参照しない api task が valueFrom 解決失敗で
     * 起動不能になる事故を防ぐ。
     */
    GITHUB_PAT = ""
    REDIS_URL  = ""
  }

  tags = local.common_tags
}

# =============================================================================
# RDS Postgres 16
# =============================================================================
# - isolated subnet に配置、SG は ECS のみから 5432 許可 (step1 で定義済み)
# - master password は AWS が自動生成し Secrets Manager に保存 (Terraform tfstate に残らない)
# - DATABASE_URL は apply 後に手動で /typing-royale-dev/app secret に追加する
#   (modules/secrets の ignore_changes により Terraform からは触れないため)

module "rds" {
  source = "../../modules/rds"

  name = "${local.name_prefix}-db"
  # メジャーバージョンのみ指定 (auto_minor_version_upgrade=true で最新マイナーを AWS が選ぶ)。
  # マイナーピン留めは AWS の EOL 廃止で create が落ちるため避ける。
  engine_version    = "16"
  instance_class    = "db.t4g.micro"
  allocated_storage = 20
  storage_type      = "gp3"
  db_name           = "typing_royale"
  master_username   = "projecttemplate"

  subnet_ids         = [for k in local.isolated_subnet_keys : module.vpc.subnets[k].id]
  security_group_ids = [module.vpc.security_groups["rds"].id]

  multi_az                = false
  backup_retention_period = 7

  # メンテ / バックアップ時間帯は JST 早朝 (UTC -9h) に寄せる
  # backup: JST 02:00-03:00 / maintenance: JST 日曜 03:00-04:00
  backup_window      = "17:00-18:00"
  maintenance_window = "sun:18:00-sun:19:00"

  # dev は気軽に terraform destroy できるよう削除保護を外し、final snapshot もスキップ
  # prd では deletion_protection = true / skip_final_snapshot = false が必須
  deletion_protection = false
  skip_final_snapshot = true

  tags = local.common_tags
}

# =============================================================================
# ElastiCache Redis 7
# =============================================================================
# - isolated subnet に配置、SG は ECS のみから 6379 許可
# - dev は 1 ノード / Multi-AZ なし / snapshot なし / TLS なしで最小コスト
# - REDIS_HOST は apply 後に scripts/seed-secrets.sh で Secrets Manager に投入する

module "elasticache" {
  source = "../../modules/elasticache"

  name           = "${local.name_prefix}-redis"
  engine_version = "7.1"
  node_type      = "cache.t4g.micro"

  subnet_ids         = [for k in local.isolated_subnet_keys : module.vpc.subnets[k].id]
  security_group_ids = [module.vpc.security_groups["redis"].id]

  # dev は最小構成
  num_cache_clusters         = 1
  automatic_failover_enabled = false
  multi_az_enabled           = false

  # dev では snapshot 取らない
  snapshot_retention_limit = 0

  # TLS in-transit はクライアント設定が必要になるので dev では OFF
  transit_encryption_enabled = false

  # メンテ時間帯 (UTC)。AWS 仕様で snapshot_window と maintenance_window は overlap 不可。
  # snapshot: 毎日 18:00-19:00 UTC (JST 03:00-04:00)
  # maintenance: 月曜 19:00-20:00 UTC (JST 月曜 04:00-05:00)
  snapshot_window    = "18:00-19:00"
  maintenance_window = "mon:19:00-mon:20:00"

  tags = local.common_tags
}

# =============================================================================
# コンテナレジストリ (ECR)
# =============================================================================

# account/ で作成済みの ECR リポジトリを参照
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
# ロードバランサー設定 (Application Load Balancer)
# =============================================================================

# ALBモジュール呼び出し
# - インターネットからの通信を受けてECSに振り分け
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
  # template では HTTP のみ運用。HTTPS 化する場合は modules/acm を呼び出して
  # certificate_arn を渡し、enable_https を true に変更する。
  enable_https    = false
  certificate_arn = null

  # === idle_timeout ===
  # 現状 SSE / long-poll エンドポイントは無いため ALB デフォルト (60 秒) を使う。
  # 将来 stream 系を足すときに modules/alb の idle_timeout を延長する。

  # === Blue/Greenデプロイ設定 ===
  # dev は素のローリングデプロイで運用する (検証コストを抑えるため)。
  # Blue/Green が必要な検証は prd で行う方針。
  enable_blue_green = false

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
# ECS Fargate Cluster
# =============================================================================
# 全 workload (API / worker / migration / 将来追加) が共有する cluster と
# task execution role を作る。各 workload はこの cluster と role を参照する。

module "ecs_cluster" {
  source = "../../modules/ecs-cluster"

  name = "${local.name_prefix}-cluster"

  # Task execution role に Secrets Manager Get 権限を持たせる対象 ARN を渡す。
  # ここで一元管理し、各 workload の task definition は valueFrom で個別キーを引くだけ。
  secret_arns_readable = [module.app_secrets.secret_arn]

  tags = local.common_tags
}

# ECS workload の「デフォルト」共通設定。
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
# ECS Workload: API (Express on Fargate, ALB + Blue/Green デプロイ)
# =============================================================================

module "ecs_api" {
  source = "../../modules/ecs-workload"

  name           = "${local.name_prefix}-api"
  image          = "${data.aws_ecr_repository.api.repository_url}:latest"
  cpu            = tonumber(var.ecs_task_cpu)
  memory         = tonumber(var.ecs_task_memory)
  container_port = var.app_port
  desired_count  = 1

  cluster_arn        = local.ecs_common.cluster_arn
  execution_role_arn = local.ecs_common.execution_role_arn
  subnets            = local.ecs_common.subnets
  security_groups    = local.ecs_common.security_groups

  secrets_arn = local.ecs_common.secrets_arn
  secret_keys = local.ecs_common.secret_keys

  # ALB (rolling deployment)
  # dev は素のローリングデプロイで運用するため Blue/Green 系のパラメータは渡さない。
  # 切替検証は prd で行う方針 (env/prd/main.tf の ecs_api を参照)。
  target_group_arn  = module.alb.target_group_a_arn
  enable_blue_green = false

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
# - 本番 API イメージに devDependencies が混入するのを避けるため、専用 ECR
#   (typing-royale-migration) + 専用 Dockerfile (packages/db/Dockerfile.migration) を使う
# - Dockerfile の CMD = `prisma migrate deploy --schema=prisma/schema.prisma` を
#   そのまま使うので command override は不要

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
# - service は作らず task definition だけを用意し (create_service = false)、
#   EventBridge Scheduler (modules/ecs-scheduled-task) が発火時に RunTask する。
# - 1 つの cron image を複数スケジュールで共有し、起動コマンドは schedule 側の
#   command override で切り替える。prd/main.tf と同じ構造。

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
# 稼働中の 2 タスクのみ登録 (batch:ranking は未実装スタブのため別 PR)。
#   - crawler:run:typescript  : 週次 月曜 03:00 JST
#   - crawler:license-recheck : 月初 1 日 04:00 JST

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
