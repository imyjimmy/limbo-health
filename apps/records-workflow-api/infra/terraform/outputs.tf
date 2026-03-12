output "alb_dns_name" {
  description = "Public DNS name for the records-workflow API load balancer."
  value       = aws_lb.api.dns_name
}

output "api_base_url" {
  description = "Base URL for records-workflow-api."
  value       = var.acm_certificate_arn == "" ? "http://${aws_lb.api.dns_name}" : "https://${aws_lb.api.dns_name}"
}

output "healthcheck_url" {
  description = "Healthcheck endpoint URL."
  value       = var.acm_certificate_arn == "" ? "http://${aws_lb.api.dns_name}/health" : "https://${aws_lb.api.dns_name}/health"
}

output "ecr_repository_url" {
  description = "ECR repository URL where records-workflow-api image should be pushed."
  value       = aws_ecr_repository.api.repository_url
}

output "database_secret_arn" {
  description = "Secrets Manager ARN containing DATABASE_URL."
  value       = aws_secretsmanager_secret.database_url.arn
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name for records-workflow-api."
  value       = aws_ecs_service.api.name
}

output "crawler_schedule_rule" {
  description = "EventBridge schedule rule name when crawl scheduling is enabled."
  value       = var.enable_scheduled_crawl ? aws_cloudwatch_event_rule.crawl_schedule[0].name : null
}
