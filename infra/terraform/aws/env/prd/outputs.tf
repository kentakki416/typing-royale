# =============================================================================
# Outputs
# =============================================================================

# VPC
output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

# Subnets
output "public_subnet_ids" {
  description = "パブリックサブネットIDのリスト (ALB / NAT Gateway 配置)"
  value       = [for k in local.public_subnet_keys : module.vpc.subnets[k].id]
}

output "private_subnet_ids" {
  description = "プライベートサブネットIDのリスト (ECS task 配置)"
  value       = [for k in local.private_subnet_keys : module.vpc.subnets[k].id]
}

output "isolated_subnet_ids" {
  description = "アイソレートサブネットIDのリスト (RDS / ElastiCache 配置)"
  value       = [for k in local.isolated_subnet_keys : module.vpc.subnets[k].id]
}

# Security Groups
output "alb_security_group_id" {
  description = "ALB に付与する SG の ID"
  value       = module.vpc.security_groups["alb"].id
}

output "ecs_security_group_id" {
  description = "ECS task に付与する SG の ID"
  value       = module.vpc.security_groups["ecs"].id
}

output "rds_security_group_id" {
  description = "RDS に付与する SG の ID"
  value       = module.vpc.security_groups["rds"].id
}

output "redis_security_group_id" {
  description = "ElastiCache に付与する SG の ID"
  value       = module.vpc.security_groups["redis"].id
}

# Secrets Manager
output "app_secret_arn" {
  description = "Application secret の ARN (ECS task definition から参照)"
  value       = module.app_secrets.secret_arn
}

output "app_secret_name" {
  description = "Application secret の名前"
  value       = module.app_secrets.secret_name
}
