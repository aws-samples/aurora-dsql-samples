#!/bin/bash
# =============================================================================
# DSQL Employee Lookup - Test Environment Setup (Docker)
# =============================================================================
# Deploys: Aurora DSQL + Lambda (container image) + API Gateway
#
# Prerequisites:
#   - AWS CLI v2 configured with credentials
#   - Docker Desktop running
#   - jq installed (brew install jq)
#
# Usage:
#   chmod +x setup-docker.sh
#   ./setup-docker.sh
# =============================================================================

set -euo pipefail

REGION="us-east-1"
FUNCTION_NAME="dsql-employee-lookup"
ROLE_NAME="dsql-employee-lookup-role"
API_NAME="dsql-employee-api"
ECR_REPO="${FUNCTION_NAME}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}"

echo "============================================"
echo "DSQL Employee Lookup - Test Environment Setup"
echo "============================================"
echo "Region: $REGION"
echo "Account: $ACCOUNT_ID"
echo "Container: Docker"
echo ""

# =============================================================================
# STEP 1: Create Aurora DSQL cluster
# =============================================================================
echo ">>> Step 1: Aurora DSQL cluster..."

read -p "    Do you already have a DSQL cluster? (y/N): " has_cluster
if [[ "$has_cluster" == "y" || "$has_cluster" == "Y" ]]; then
  read -p "    Enter cluster endpoint: " CLUSTER_ENDPOINT
  CLUSTER_ID=$(echo $CLUSTER_ENDPOINT | cut -d'.' -f1)
else
  echo "    Creating cluster..."
  CLUSTER_OUTPUT=$(aws dsql create-cluster \
    --no-deletion-protection-enabled \
    --region $REGION \
    --output json)

  CLUSTER_ID=$(echo $CLUSTER_OUTPUT | jq -r '.identifier')
  CLUSTER_ENDPOINT=$(echo $CLUSTER_OUTPUT | jq -r '.endpoint')

  echo "    Cluster ID: $CLUSTER_ID"
  echo "    Endpoint: $CLUSTER_ENDPOINT"
  echo "    Waiting for cluster to become ACTIVE..."

  while true; do
    STATUS=$(aws dsql get-cluster --identifier $CLUSTER_ID --region $REGION --query 'status' --output text 2>/dev/null || echo "CREATING")
    if [ "$STATUS" == "ACTIVE" ]; then
      break
    fi
    echo "    Status: $STATUS - waiting..."
    sleep 10
  done
  echo "    Cluster is ACTIVE!"
fi
echo ""

# =============================================================================
# STEP 2: Build Rust binary inside Docker container
# =============================================================================
echo ">>> Step 2: Building Rust Lambda binary (Docker container)..."

docker run --rm -v $(pwd):/code -w /code \
  public.ecr.aws/sam/build-provided.al2023:latest-arm64 \
  bash -c "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && \
  source \$HOME/.cargo/env && \
  pip3 install cargo-lambda && \
  cargo lambda build --release --arm64 --output-format binary"

echo "    Binary built!"
echo ""

# =============================================================================
# STEP 3: Build container image and push to ECR
# =============================================================================
echo ">>> Step 3: Building and pushing container image to ECR..."

# Create ECR repo (ignore if exists)
aws ecr create-repository \
  --repository-name $ECR_REPO \
  --region $REGION 2>/dev/null || echo "    ECR repo already exists"

# Login to ECR
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

# Build container image
docker build --platform linux/arm64 -t ${ECR_URI}:latest .

# Push to ECR
docker push ${ECR_URI}:latest

echo "    Image pushed: ${ECR_URI}:latest"
echo ""

# =============================================================================
# STEP 4: Create IAM Role for Lambda
# =============================================================================
echo ">>> Step 4: Creating IAM role..."

cat > /tmp/trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role \
  --role-name $ROLE_NAME \
  --assume-role-policy-document file:///tmp/trust-policy.json \
  --output text --query 'Role.Arn' 2>/dev/null || echo "    Role already exists"

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

aws iam attach-role-policy \
  --role-name $ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole 2>/dev/null || true

cat > /tmp/dsql-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "dsql:DbConnect",
    "Resource": "arn:aws:dsql:${REGION}:${ACCOUNT_ID}:cluster/${CLUSTER_ID}"
  }]
}
EOF

aws iam put-role-policy \
  --role-name $ROLE_NAME \
  --policy-name dsql-connect \
  --policy-document file:///tmp/dsql-policy.json

echo "    IAM role configured"
echo "    Waiting for role propagation..."
sleep 10
echo ""

# =============================================================================
# STEP 5: Create Lambda function from container image
# =============================================================================
echo ">>> Step 5: Creating Lambda function..."

aws lambda create-function \
  --function-name $FUNCTION_NAME \
  --package-type Image \
  --code ImageUri=${ECR_URI}:latest \
  --role $ROLE_ARN \
  --architectures arm64 \
  --timeout 30 \
  --memory-size 128 \
  --environment "Variables={DSQL_ENDPOINT=$CLUSTER_ENDPOINT,DSQL_USER=app_readonly,RUST_LOG=info}" \
  --region $REGION \
  --output text --query 'FunctionArn'

echo "    Waiting for function to be active..."
aws lambda wait function-active-v2 \
  --function-name $FUNCTION_NAME \
  --region $REGION
echo "    Lambda function deployed!"
echo ""

# =============================================================================
# STEP 6: Create API Gateway HTTP API
# =============================================================================
echo ">>> Step 6: Creating API Gateway..."

API_OUTPUT=$(aws apigatewayv2 create-api \
  --name $API_NAME \
  --protocol-type HTTP \
  --region $REGION \
  --output json)

API_ID=$(echo $API_OUTPUT | jq -r '.ApiId')
API_ENDPOINT=$(echo $API_OUTPUT | jq -r '.ApiEndpoint')

FUNCTION_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME}"

INTEGRATION_ID=$(aws apigatewayv2 create-integration \
  --api-id $API_ID \
  --integration-type AWS_PROXY \
  --integration-uri $FUNCTION_ARN \
  --payload-format-version "2.0" \
  --region $REGION \
  --output text --query 'IntegrationId')

aws apigatewayv2 create-route \
  --api-id $API_ID \
  --route-key "POST /lookup" \
  --target "integrations/$INTEGRATION_ID" \
  --region $REGION > /dev/null

aws apigatewayv2 create-stage \
  --api-id $API_ID \
  --stage-name '$default' \
  --auto-deploy \
  --region $REGION > /dev/null

aws lambda add-permission \
  --function-name $FUNCTION_NAME \
  --statement-id apigateway-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*" \
  --region $REGION > /dev/null

echo "    API Gateway configured!"
echo ""

# =============================================================================
# DONE
# =============================================================================
echo "============================================"
echo "SETUP COMPLETE!"
echo "============================================"
echo ""
echo "Resources:"
echo "  DSQL Cluster:    $CLUSTER_ID"
echo "  DSQL Endpoint:   $CLUSTER_ENDPOINT"
echo "  ECR Image:       ${ECR_URI}:latest"
echo "  Lambda Function: $FUNCTION_NAME"
echo "  API Gateway:     $API_ID"
echo "  API Endpoint:    $API_ENDPOINT"
echo ""
echo "NEXT STEPS:"
echo ""
echo "  1. Seed the database (connect via Query Editor or psql, run seed.sql)"
echo ""
echo "  2. Test the API:"
echo "     curl -X POST ${API_ENDPOINT}/lookup \\"
echo "       -H 'Content-Type: application/json' \\"
echo "       -d '{\"name\": \"Alice\"}'"
echo ""
echo "  3. Teardown when done:"
echo "     aws lambda delete-function --function-name $FUNCTION_NAME --region $REGION"
echo "     aws apigatewayv2 delete-api --api-id $API_ID --region $REGION"
echo "     aws ecr delete-repository --repository-name $ECR_REPO --force --region $REGION"
echo "     aws dsql delete-cluster --identifier $CLUSTER_ID --region $REGION"
echo "     aws iam delete-role-policy --role-name $ROLE_NAME --policy-name dsql-connect"
echo "     aws iam detach-role-policy --role-name $ROLE_NAME --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
echo "     aws iam delete-role --role-name $ROLE_NAME"
echo ""

cat > env.sh << EOF
export REGION="$REGION"
export CLUSTER_ID="$CLUSTER_ID"
export CLUSTER_ENDPOINT="$CLUSTER_ENDPOINT"
export FUNCTION_NAME="$FUNCTION_NAME"
export ROLE_NAME="$ROLE_NAME"
export API_ID="$API_ID"
export API_ENDPOINT="$API_ENDPOINT"
export ECR_URI="$ECR_URI"
export ACCOUNT_ID="$ACCOUNT_ID"
EOF

echo "Environment saved to env.sh"
