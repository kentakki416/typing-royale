# =============================================================================
# ECS Scheduled Task (EventBridge Scheduler → ECS RunTask)
# =============================================================================
# 常駐 service を持たない cron / batch を「発火時だけ Fargate task を起動」する。
# 待機コストゼロ (起動した分だけ課金) なのでコスト最適。
#
# 設計の要点:
#   - task_definition_arn は revision を含めない family ARN を渡す。これにより
#     RunTask は常に latest ACTIVE revision を起動し、CI が image を更新して新
#     リビジョンを register しても Terraform を再 apply せずに最新が走る
#     (ECS service の data.aws_ecs_task_definition と同じ「最新追従」思想)。
#   - command の差し替えは Scheduler target の input (= RunTask overrides) で行う。
#     1 つの cron image / task definition を複数スケジュールで使い回せる。

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  /**
   * revision なしの task definition ARN。
   * 例: arn:aws:ecs:ap-northeast-1:123456789012:task-definition/typing-royale-prd-cron
   */
  task_definition_arn = "arn:aws:ecs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:task-definition/${var.task_definition_family}"

  /** PassRole 対象。task_role を別指定したときのみ 2 つになる */
  pass_role_arns = distinct(compact([
    var.execution_role_arn,
    var.task_role_arn != null ? var.task_role_arn : var.execution_role_arn,
  ]))
}

# =============================================================================
# IAM Role: EventBridge Scheduler が RunTask を呼ぶための実行ロール
# =============================================================================

resource "aws_iam_role" "scheduler" {
  name = "${var.name}-scheduler"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "scheduler.amazonaws.com"
      }
      # confused deputy 対策: 自アカウントの Scheduler からの assume のみ許可
      Condition = {
        StringEquals = {
          "aws:SourceAccount" = data.aws_caller_identity.current.account_id
        }
      }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "scheduler" {
  name = "run-task"
  role = aws_iam_role.scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "RunTask"
        Effect = "Allow"
        Action = "ecs:RunTask"
        # revision なし ARN (latest ACTIVE 解決用) と revision 付き ARN の両方を許可する。
        # RunTask に revision なし ARN を渡すと latest ACTIVE が使われるが、IAM 認可で
        # 評価される resource が revision なし / 解決後 revision 付きのどちらでも通るように両方記載。
        Resource = [
          local.task_definition_arn,
          "${local.task_definition_arn}:*",
        ]
        Condition = {
          ArnEquals = {
            "ecs:cluster" = var.cluster_arn
          }
        }
      },
      {
        Sid      = "PassTaskRoles"
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = local.pass_role_arns
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "ecs-tasks.amazonaws.com"
          }
        }
      },
    ]
  })
}

# =============================================================================
# EventBridge Scheduler Schedule
# =============================================================================

resource "aws_scheduler_schedule" "this" {
  name = var.name

  flexible_time_window {
    mode                      = var.flexible_time_window_minutes > 0 ? "FLEXIBLE" : "OFF"
    maximum_window_in_minutes = var.flexible_time_window_minutes > 0 ? var.flexible_time_window_minutes : null
  }

  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = var.schedule_timezone
  state                        = var.state

  target {
    arn      = var.cluster_arn
    role_arn = aws_iam_role.scheduler.arn

    # command を上書きする場合は RunTask の overrides として input に渡す。
    # null のときは Dockerfile の CMD がそのまま使われる。
    input = var.command != null ? jsonencode({
      containerOverrides = [{
        name    = var.container_name
        command = var.command
      }]
    }) : null

    ecs_parameters {
      task_definition_arn = local.task_definition_arn
      task_count          = var.task_count
      launch_type         = "FARGATE"
      platform_version    = var.platform_version

      network_configuration {
        subnets          = var.subnets
        security_groups  = var.security_groups
        assign_public_ip = false
      }
    }

    # バッチ失敗時は即リトライせず次回スケジュールに任せる
    # (crawler は GitHub rate limit に当たると連投しても無駄なため)
    retry_policy {
      maximum_retry_attempts = 0
    }
  }
}
