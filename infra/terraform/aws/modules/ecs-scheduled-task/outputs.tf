output "schedule_arn" {
  description = "作成した EventBridge Scheduler schedule の ARN"
  value       = aws_scheduler_schedule.this.arn
}

output "schedule_name" {
  description = "作成した schedule 名"
  value       = aws_scheduler_schedule.this.name
}

output "scheduler_role_arn" {
  description = "Scheduler が RunTask を呼ぶときに assume する IAM role の ARN"
  value       = aws_iam_role.scheduler.arn
}
