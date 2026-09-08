#!/bin/bash
# =============================================================================
# DSQL Employee Lookup - Zip Deployment (Linux)
# =============================================================================
# Deploys Lambda as a .zip package (250MB unzipped limit).
# Run this on a Linux machine or in a Linux CI/CD pipeline.
#
# IMPORTANT: Requires [profile.release] strip=true and lto=true in Cargo.toml
# to keep binary under 250MB. If your binary exceeds 250MB, use the container
# approach instead (../container/setup.sh).
#
# Prerequisites:
#   - AWS CLI v2 configured with credentials
#   - Rust 1.84+ and cargo-lambda installed
#   - jq installed
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
# =============================================================================

set -euo pipefail

REGION="us-east-1"
FUNCTION_NAME="dsql-employee-lookup"
ROLE_NAME="dsql-employee-lookup-role"
API_NAME="dsql-employee-api"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "============================================"
echo "DSQL Employee Lookup - Zip Deployment"
echo "============================================"
echo "Region:  $REGION"
echo "Account: $ACCOUNT_ID"
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
  echo "    Endpoint:   $CLUSTER_ENDPOINT"
  echo "    Waiting for cluster to become ACTIVE..."

  while true; do
    STATUS=$(aws dsql get-cluster --identifier $CLUSTER_ID --region $REGION --query 'status' --output text 2>/dev/null || echo "CREATING")
    if [ "$STATUS" == "ACTIVE" ]; then break; fi
    echo "    Status: $STATUS - waiting..."
    sleep 10
  done
  echo "    Cluster is ACTIVE!"
fi
echo ""

# =============================================================================
# STEP 2: Build Rust binary as zip
# =============================================================================
echo ">>> Step 2: Building Rust Lambda binary (.zip)..."

cargo lambda build --release --arm64 --output-format zip

ZIP_PATH="../../target/lambda/${FUNCTION_NAME}/bootstrap.zip"

if [ ! -f "$ZIP_PATH" ]; then
  echo "    ERROR: Zip not found at $ZIP_PATH"
  echo "    Trying alternate location..."
  ZIP_PATH=$(find ../../target -name "bootstrap.zip" -print -quit)
fi

ZIP_SIZE=$(stat -c%s "$ZIP_PATH" 2>/dev/null || stat -f%z "$ZIP_PATH")
echo "    Zip: $ZIP_PATH ($(echo "scale=1; $ZIP_SIZE/1048576" | bc) MB)"

# Check if unzipped size exceeds Lambda limit
UNZIPPED_SIZE=$(unzip -l "$ZIP_PATH" | tail -1 | awk '{print $1}')
if [ "$UNZIPPED_SIZE" -gt 262144000 ]; then
  echo ""
  echo "    WARNING: Unzipped size ($UNZIPPED_SIZE bytes) exceeds Lambda's 250MB limit!"
  echo "    Use the container approach instead: ../container/setup.sh"
  echo ""
  read -p "    Continue anyway? (y/N): " force_continue
  if [[ "$force_continue" != "y" && "$force_continue" != "Y" ]]; then
    echo "    Aborted. Use ../container/setup.sh instead."
    exit 1
  fi
fi
echo ""

# =============================================================================
# STEP 3: Create IAM Role
# =============================================================================
echo ">>> Step 3: Creating IAM role..."

aws iam create-role \
  --role-name $ROLE_NAME \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
  --output text --query 'Role.Arn' 2>/dev/null || echo "    Role already exists"

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

aws iam attach-role-policy \
  --role-name $ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole 2>/dev/null || true

aws iam put-role-policy \
  --role-name $ROLE_NAME \
  --policy-name dsql-connect \
  --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"dsql:DbConnectAdmin\",\"Resource\":\"arn:aws:dsql:${REGION}:${ACCOUNT_ID}:cluster/${CLUSTER_ID}\"}]}"

echo "    IAM role configured. Waiting for propagation..."
sleep 10
echo ""

# =============================================================================
# STEP 4: Create Lambda function (zip)
# =============================================================================
echo ">>> Step 4: Creating Lambda function..."

aws lambda create-function \
  --function-name $FUNCTION_NAME \
  --runtime provided.al2023 \
  --handler bootstrap \
  --architectures arm64 \
  --role $ROLE_ARN \
  --zip-file fileb://$ZIP_PATH \
  --timeout 30 \
  --memory-size 128 \
  --environment "Variables={DSQL_ENDPOINT=$CLUSTER_ENDPOINT,DSQL_USER=admin,RUST_LOG=info}" \
  --region $REGION \
  --output text --query 'FunctionArn'

echo "    Waiting for function to be active..."
aws lambda wait function-active-v2 --function-name $FUNCTION_NAME --region $REGION
echo "    Lambda deployed!"
echo ""

# =============================================================================
# STEP 5: Create API Gateway HTTP API
# =============================================================================
echo ">>> Step 5: Creating API Gateway..."

API_OUTPUT=$(aws apigatewayv2 create-api \
  --name $API_NAME --protocol-type HTTP --region $REGION --output json)
API_ID=$(echo $API_OUTPUT | jq -r '.ApiId')
API_ENDPOINT=$(echo $API_OUTPUT | jq -r '.ApiEndpoint')

FUNCTION_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME}"

INTEGRATION_ID=$(aws apigatewayv2 create-integration \
  --api-id $API_ID --integration-type AWS_PROXY \
  --integration-uri $FUNCTION_ARN --payload-format-version "2.0" \
  --region $REGION --output text --query 'IntegrationId')

aws apigatewayv2 create-route --api-id $API_ID \
  --route-key "POST /lookup" --target "integrations/$INTEGRATION_ID" \
  --region $REGION > /dev/null

aws apigatewayv2 create-stage --api-id $API_ID \
  --stage-name '$default' --auto-deploy --region $REGION > /dev/null

aws lambda add-permission --function-name $FUNCTION_NAME \
  --statement-id apigateway-invoke --action lambda:InvokeFunction \
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
echo "  DSQL Endpoint: $CLUSTER_ENDPOINT"
echo "  API Endpoint:  ${API_ENDPOINT}/lookup"
echo ""
echo "Test: curl -X POST ${API_ENDPOINT}/lookup -H 'Content-Type: application/json' -d '{\"name\":\"Alice\"}'"
echo ""
echo "Teardown:"
echo "  aws lambda delete-function --function-name $FUNCTION_NAME --region $REGION"
echo "  aws apigatewayv2 delete-api --api-id $API_ID --region $REGION"
echo "  aws dsql delete-cluster --identifier $CLUSTER_ID --region $REGION"
echo "  aws iam delete-role-policy --role-name $ROLE_NAME --policy-name dsql-connect"
echo "  aws iam detach-role-policy --role-name $ROLE_NAME --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
echo "  aws iam delete-role --role-name $ROLE_NAME"
