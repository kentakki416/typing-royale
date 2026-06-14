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

# RDS
output "rds_endpoint" {
  description = "RDS 接続エンドポイント (host:port)"
  value       = module.rds.endpoint
}

output "rds_address" {
  description = "RDS ホスト名"
  value       = module.rds.address
}

output "rds_db_name" {
  description = "初期データベース名"
  value       = module.rds.db_name
}

output "rds_master_username" {
  description = "マスターユーザー名"
  value       = module.rds.master_username
}

output "rds_master_user_secret_arn" {
  description = "AWS 自動生成パスワードが保存されている Secrets Manager の ARN"
  value       = module.rds.master_user_secret_arn
}

# ElastiCache
output "redis_address" {
  description = "Redis primary endpoint のホスト名"
  value       = module.elasticache.primary_endpoint_address
}

output "redis_port" {
  description = "Redis port"
  value       = module.elasticache.port
}

# ALB
output "alb_dns_name" {
  description = "ALBのDNS名 (HTTPS 化前の動作確認用 / Route53 ALIAS 先)"
  value       = module.alb.alb_dns_name
}

output "alb_zone_id" {
  description = "ALBのZone ID"
  value       = module.alb.alb_zone_id
}

# DNS / TLS (var.domain_name が空のときは null)
output "acm_certificate_arn" {
  description = "ACM 証明書 ARN (ALB HTTPS listener にアタッチ済み)"
  value       = length(module.acm) > 0 ? module.acm[0].certificate_arn : null
}

output "api_fqdn" {
  description = "Route53 で作成された API の FQDN (例: api.prd.example.com)"
  value       = length(module.route53_api) > 0 ? module.route53_api[0].fqdn : null
}
