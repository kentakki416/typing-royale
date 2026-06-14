# =============================================================================
# 基本設定
# =============================================================================

variable "project_name" {
  description = "プロジェクト名"
  type        = string
  default     = "project-template" # TODO: bootstrap / account / dev と同じプロジェクト名を維持する
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
  # TODO: prd 公開前に社内 VPN / オフィス固定 IP の CIDR に差し替えること（現状はあくまで dev と同じ全公開デフォルト）
  type    = list(string)
  default = ["0.0.0.0/0"]
}

# =============================================================================
# ECS / Log の設定は ECS workload を追加する後続 step PR で variable を追加する
# =============================================================================

# =============================================================================
# タグ設定
# =============================================================================

variable "additional_tags" {
  description = "追加のタグ"
  type        = map(string)
  default     = {}
}

# =============================================================================
# Secrets (アプリケーション機密)
# =============================================================================
# 方針: Terraform は「箱」(Secrets Manager secret) と「初回 JWT 自動生成」までを管理し、
# 残りの値 (DATABASE_URL / REDIS_HOST / GOOGLE_* / LIVEKIT_* / FRONTEND_URL) は
# Console / CLI で手動登録する。secret_version は ignore_changes でガード済み。
