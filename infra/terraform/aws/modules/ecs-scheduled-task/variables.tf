# =============================================================================
# 必須パラメータ
# =============================================================================

variable "name" {
  description = "スケジュール識別子 (例: typing-royale-prd-crawler-typescript)。schedule 名 / IAM role 名のベース"
  type        = string
}

variable "schedule_expression" {
  description = "EventBridge Scheduler の式 (例: cron(0 3 ? * MON *) = 毎週月曜 03:00)。schedule_timezone で解釈される"
  type        = string
}

variable "cluster_arn" {
  description = "RunTask を投げる ECS cluster の ARN"
  type        = string
}

variable "task_definition_family" {
  description = "起動する task definition の family 名。revision を含めない ARN を組み立てて latest ACTIVE revision を都度起動する (CI の image 更新を再 apply なしで拾うため)"
  type        = string
}

variable "subnets" {
  description = "task を配置する subnet ID のリスト (private subnet)"
  type        = list(string)
}

variable "security_groups" {
  description = "task に付与する Security Group ID のリスト"
  type        = list(string)
}

variable "execution_role_arn" {
  description = "task execution role ARN。Scheduler が PassRole する対象"
  type        = string
}

# =============================================================================
# 任意パラメータ
# =============================================================================

variable "task_role_arn" {
  description = "task role ARN。null なら execution_role_arn を流用 (PassRole 対象に含める)"
  type        = string
  default     = null
}

variable "container_name" {
  description = "command を上書きする対象コンテナ名 (= ecs-workload の var.name と一致させる)。command が null のときは未使用"
  type        = string
  default     = null
}

variable "command" {
  description = "コンテナ起動コマンドの上書き。RunTask の containerOverrides.command として渡す。null なら Dockerfile の CMD を使用"
  type        = list(string)
  default     = null
}

variable "schedule_timezone" {
  description = "schedule_expression を解釈するタイムゾーン。JST 固定運用なので既定は Asia/Tokyo"
  type        = string
  default     = "Asia/Tokyo"
}

variable "task_count" {
  description = "1 回の発火で起動する task 数"
  type        = number
  default     = 1
}

variable "platform_version" {
  description = "Fargate platform version"
  type        = string
  default     = "LATEST"
}

variable "flexible_time_window_minutes" {
  description = "発火時刻の許容ズレ (分)。0 で OFF (厳密発火)。バッチは多少ズレても良いので既定 15 分"
  type        = number
  default     = 15
}

variable "state" {
  description = "スケジュールの有効/無効。ENABLED / DISABLED"
  type        = string
  default     = "ENABLED"
}

variable "tags" {
  type    = map(string)
  default = {}
}
