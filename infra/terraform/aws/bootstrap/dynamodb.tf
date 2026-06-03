# =============================================================================
# DynamoDB Table for Terraform State Lock
# =============================================================================

# Terraform state lock用のDynamoDBテーブル
resource "aws_dynamodb_table" "terraform_state_lock" {
  name         = var.dynamodb_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name = "Terraform State Lock Table"
  }
}
