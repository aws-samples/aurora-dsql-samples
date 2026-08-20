# =============================================================================
# DSQL Employee Lookup - Terraform (Container Image)
# =============================================================================
# Pre-requisite: Build and push container image to ECR first.
#
# USAGE:
#   terraform init
#   terraform apply -var="image_uri=<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/dsql-employee-lookup:latest"
# =============================================================================

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" { region = var.region }

variable "region"        { default = "us-east-1" }
variable "image_uri"     { type = string }
variable "function_name" { default = "dsql-employee-lookup" }

data "aws_caller_identity" "current" {}

# --- Aurora DSQL ---
resource "aws_dsql_cluster" "main" {
  deletion_protection_enabled = false
  tags = { Project = "dsql-employee-lookup" }
}

# --- IAM Role ---
resource "aws_iam_role" "lambda" {
  name = "${var.function_name}-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "dsql" {
  name = "dsql-connect"
  role = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "dsql:DbConnectAdmin", Resource = "arn:aws:dsql:${var.region}:${data.aws_caller_identity.current.account_id}:cluster/${aws_dsql_cluster.main.id}" }]
  })
}

# --- Lambda (Container Image) ---
resource "aws_lambda_function" "main" {
  function_name = var.function_name
  package_type  = "Image"
  image_uri     = var.image_uri
  role          = aws_iam_role.lambda.arn
  architectures = ["arm64"]
  timeout       = 30
  memory_size   = 128
  environment {
    variables = {
      DSQL_ENDPOINT = aws_dsql_cluster.main.endpoint
      DSQL_USER     = "admin"
      RUST_LOG      = "info"
    }
  }
  depends_on = [aws_iam_role_policy_attachment.basic, aws_iam_role_policy.dsql]
}

# --- API Gateway ---
resource "aws_apigatewayv2_api" "main" {
  name          = "${var.function_name}-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.main.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "lookup" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /lookup"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "apigw" {
  function_name = aws_lambda_function.main.function_name
  action        = "lambda:InvokeFunction"
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*"
}

# --- Outputs ---
output "api_endpoint"    { value = "${aws_apigatewayv2_api.main.api_endpoint}/lookup" }
output "dsql_endpoint"   { value = aws_dsql_cluster.main.endpoint }
output "dsql_cluster_id" { value = aws_dsql_cluster.main.id }
