# =============================================================================
# 基本設定
# =============================================================================

variable "project_name" {
  description = "プロジェクト名"
  type        = string
  default     = "typing-royale"
}

variable "environment" {
  description = "環境名（dev, stg, prd）"
  type        = string
  default     = "prd"
}

variable "aws_region" {
  description = "AWSリージョン"
  type        = string
  default     = "ap-northeast-1"
}

# =============================================================================
# ネットワーク設定
# =============================================================================

variable "vpc_cidr" {
  description = "VPCのCIDRブロック。dev (10.0.0.0/16) と重複しないよう 10.1.0.0/16 を採用"
  type        = string
  default     = "10.1.0.0/16"
}

variable "availability_zones" {
  description = "使用するAvailability Zones"
  type        = list(string)
  default     = ["ap-northeast-1a", "ap-northeast-1c"]
}

# =============================================================================
# アプリケーション設定
# =============================================================================

variable "app_port" {
  description = "アプリケーションのポート番号"
  type        = number
  default     = 8080
}

# =============================================================================
# Blue/Greenデプロイ設定
# =============================================================================

variable "test_listener_allowed_cidrs" {
  description = "テスト用リスナー（ポート9000）へのアクセスを許可するCIDRリスト。prd では社内 VPN / オフィス IP に絞ること"
  # TODO: prd 公開前に社内 VPN / オフィス固定 IP の CIDR に差し替えること
  type    = list(string)
  default = ["0.0.0.0/0"]
}

# =============================================================================
# DNS / TLS 設定 (Route53 + ACM)
# =============================================================================
# 本 step (Step 3) では以下の手動セットアップが完了している前提で動作する:
# 1. Route53 hosted zone が `var.domain_name` で AWS アカウントに作成済み
# 2. ドメインの NS レコードがレジストラに登録済み (DNS 検証が通るために必須)
#
# hosted zone が未作成の状態で apply すると `data "aws_route53_zone"` の lookup
# でエラーになり plan 失敗する。事前に Route53 Console から hosted zone を
# 作成しておくこと。

variable "domain_name" {
  description = "サービスのルートドメイン (例: typing-royale.com)。Route53 hosted zone がこの名前で作成済みであること。空文字列にすると DNS / ACM / HTTPS をすべて無効化し HTTP ALB のみ作成する"
  type        = string
  # Route53 Domains で typing-royale.com を登録済み (hosted zone 自動作成)。
  # 空にすると DNS/ACM/HTTPS を無効化し HTTP ALB のみになる。
  default = "typing-royale.com"
}

variable "subdomain" {
  description = "環境サブドメイン。本番は空文字 (api.<domain> / ACM は *.<domain>)。stg/dev など非本番で値を入れると api.<subdomain>.<domain> / ACM は *.<subdomain>.<domain> になる"
  type        = string
  default     = ""
}

variable "api_subdomain" {
  description = "API ホスト用のサブドメインパーツ (例: api)。最終 FQDN は subdomain 空なら <api_subdomain>.<domain_name> (例: api.typing-royale.com)、値ありなら <api_subdomain>.<subdomain>.<domain_name> (例: api.stg.typing-royale.com)"
  type        = string
  default     = "api"
}

# =============================================================================
# ECS設定
# =============================================================================

variable "ecs_task_cpu" {
  description = "ECSタスクのCPUユニット（256 = 0.25 vCPU, 512 = 0.5 vCPU, 1024 = 1 vCPU）。prd は 512 (= 0.5 vCPU) からスタート"
  type        = string
  default     = "512"
}

variable "ecs_task_memory" {
  description = "ECSタスクのメモリ（MB）。prd は 1024 (= 1 GB) からスタート"
  type        = string
  default     = "1024"
}

variable "ecs_api_desired_count" {
  description = "API ECS service の desired_count。prd は最低 2 (AZ 冗長 + ローリングデプロイ余裕)"
  type        = number
  default     = 2
}

variable "log_retention_days" {
  description = "CloudWatch Logsの保存期間（日数）。prd は本番監視を考慮して 30 日"
  type        = number
  default     = 30
}

# =============================================================================
# タグ設定
# =============================================================================

variable "additional_tags" {
  description = "追加のタグ"
  type        = map(string)
  default     = {}
}
