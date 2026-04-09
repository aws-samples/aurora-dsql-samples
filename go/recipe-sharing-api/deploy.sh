#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
#
# deploy.sh - Deploy the Recipe Sharing API to AWS.
#
# Builds the Go binary for AWS Lambda (Linux/ARM64), uploads it to Amazon S3,
# and deploys the infrastructure via AWS CloudFormation.
#
# Usage:
#   ./deploy.sh \
#     --account 123456789012 \
#     --region us-east-1 \
#     --allowed-ip 203.0.113.42 \
#     --dsql-cluster-id abc123xyz456
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------
info()  { printf "\033[1;34m[INFO]\033[0m  %s\n" "$*"; }
ok()    { printf "\033[1;32m[OK]\033[0m    %s\n" "$*"; }
warn()  { printf "\033[1;33m[WARN]\033[0m  %s\n" "$*"; }
err()   { printf "\033[1;31m[ERROR]\033[0m %s\n" "$*" >&2; }

# ---------------------------------------------------------------------------
# Default values
# ---------------------------------------------------------------------------
ACCOUNT=""
REGION=""
ALLOWED_IP=""
DSQL_CLUSTER_ID=""
STACK_NAME="recipe-share-stack"

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Required:
  --account          AWS account ID (12 digits)
  --region           AWS region (e.g., us-east-1)
  --allowed-ip       Public IP address allowed to access the API
  --dsql-cluster-id  Amazon Aurora DSQL cluster identifier

Optional:
  --stack-name       AWS CloudFormation stack name (default: recipe-share-stack)
  --help             Show this help message

Example:
  ./deploy.sh \\
    --account 123456789012 \\
    --region us-east-1 \\
    --allowed-ip \$(curl -s https://checkip.amazonaws.com) \\
    --dsql-cluster-id abc123xyz456
EOF
  exit 1
}

# ---------------------------------------------------------------------------
# Parse named arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --account)        ACCOUNT="$2";         shift 2 ;;
    --region)         REGION="$2";          shift 2 ;;
    --allowed-ip)     ALLOWED_IP="$2";      shift 2 ;;
    --dsql-cluster-id) DSQL_CLUSTER_ID="$2"; shift 2 ;;
    --stack-name)     STACK_NAME="$2";      shift 2 ;;
    --help)           usage ;;
    *)                err "Unknown argument: $1"; usage ;;
  esac
done

# ---------------------------------------------------------------------------
# Validate required arguments
# ---------------------------------------------------------------------------
MISSING=0
if [[ -z "$ACCOUNT" ]];         then err "Missing --account";         MISSING=1; fi
if [[ -z "$REGION" ]];          then err "Missing --region";          MISSING=1; fi
if [[ -z "$ALLOWED_IP" ]];      then err "Missing --allowed-ip";      MISSING=1; fi
if [[ -z "$DSQL_CLUSTER_ID" ]]; then err "Missing --dsql-cluster-id"; MISSING=1; fi
if [[ $MISSING -eq 1 ]]; then echo; usage; fi

# Append /32 CIDR suffix if not already present.
if [[ "$ALLOWED_IP" != *"/"* ]]; then
  ALLOWED_IP="${ALLOWED_IP}/32"
fi

# Construct the Amazon Aurora DSQL endpoint from the cluster ID and region.
DSQL_ENDPOINT="${DSQL_CLUSTER_ID}.dsql.${REGION}.on.aws"

# Derived names
S3_BUCKET="${STACK_NAME}-deploy-${ACCOUNT}-${REGION}"
S3_KEY="lambda/bootstrap.zip"
BINARY_NAME="bootstrap"
ZIP_NAME="bootstrap.zip"
TEMPLATE_FILE="infrastructure/cloudformation.yml"

info "============================================="
info "  Recipe Sharing API - Deployment"
info "============================================="
info "Account:           ${ACCOUNT}"
info "Region:            ${REGION}"
info "Allowed IP:        ${ALLOWED_IP}"
info "DSQL Cluster ID:   ${DSQL_CLUSTER_ID}"
info "DSQL Endpoint:     ${DSQL_ENDPOINT}"
info "Stack Name:        ${STACK_NAME}"
info "S3 Bucket:         ${S3_BUCKET}"
echo

# ---------------------------------------------------------------------------
# Step 1: Check prerequisites
# ---------------------------------------------------------------------------
info "Checking prerequisites..."

if ! command -v aws &>/dev/null; then
  err "AWS CLI is not installed. See https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
  exit 1
fi

if ! command -v go &>/dev/null; then
  err "Go is not installed. See https://go.dev/doc/install"
  exit 1
fi

# Verify Go version is 1.24 or later.
GO_VERSION=$(go version | sed 's/.*go\([0-9]*\.[0-9]*\).*/\1/')
GO_MAJOR=$(echo "$GO_VERSION" | cut -d. -f1)
GO_MINOR=$(echo "$GO_VERSION" | cut -d. -f2)
if [[ "$GO_MAJOR" -lt 1 ]] || { [[ "$GO_MAJOR" -eq 1 ]] && [[ "$GO_MINOR" -lt 24 ]]; }; then
  err "Go 1.24 or later is required (found go${GO_VERSION})"
  exit 1
fi

# Verify AWS credentials are valid.
if ! aws sts get-caller-identity --region "$REGION" &>/dev/null; then
  err "AWS credentials are not configured or are invalid."
  err "Run 'aws configure' or set AWS_PROFILE."
  exit 1
fi
ok "Prerequisites verified (AWS CLI, Go ${GO_VERSION}, valid credentials)"

# ---------------------------------------------------------------------------
# Step 2: Build the Go binary for Lambda (Linux/ARM64)
# ---------------------------------------------------------------------------
info "Building Go binary for Linux/ARM64..."
GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -tags lambda.norpc \
  -ldflags="-s -w" \
  -o "${BINARY_NAME}" \
  ./cmd/lambda/
ok "Binary built: ${BINARY_NAME}"

# ---------------------------------------------------------------------------
# Step 3: Package the binary into a ZIP file
# ---------------------------------------------------------------------------
info "Packaging deployment ZIP..."
zip -j "${ZIP_NAME}" "${BINARY_NAME}" >/dev/null
rm -f "${BINARY_NAME}"
ok "Package created: ${ZIP_NAME}"

# ---------------------------------------------------------------------------
# Step 4: Create the S3 bucket if it does not exist
# ---------------------------------------------------------------------------
info "Checking S3 deployment bucket..."
if ! aws s3api head-bucket --bucket "$S3_BUCKET" --region "$REGION" 2>/dev/null; then
  info "Creating S3 bucket: ${S3_BUCKET}"
  if [[ "$REGION" == "us-east-1" ]]; then
    aws s3api create-bucket \
      --bucket "$S3_BUCKET" \
      --region "$REGION" >/dev/null
  else
    aws s3api create-bucket \
      --bucket "$S3_BUCKET" \
      --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
  fi
  ok "S3 bucket created"
else
  ok "S3 bucket already exists"
fi

# ---------------------------------------------------------------------------
# Step 5: Upload the deployment ZIP to S3
# ---------------------------------------------------------------------------
info "Uploading deployment package to S3..."
aws s3 cp "${ZIP_NAME}" "s3://${S3_BUCKET}/${S3_KEY}" --region "$REGION" >/dev/null
rm -f "${ZIP_NAME}"
ok "Package uploaded to s3://${S3_BUCKET}/${S3_KEY}"

# ---------------------------------------------------------------------------
# Step 6: Deploy the AWS CloudFormation stack
# ---------------------------------------------------------------------------
info "Deploying AWS CloudFormation stack: ${STACK_NAME}..."
aws cloudformation deploy \
  --template-file "$TEMPLATE_FILE" \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    AccountId="$ACCOUNT" \
    DSQLClusterId="$DSQL_CLUSTER_ID" \
    DSQLClusterEndpoint="$DSQL_ENDPOINT" \
    AllowedIP="$ALLOWED_IP" \
    LambdaS3Bucket="$S3_BUCKET" \
    LambdaS3Key="$S3_KEY" \
  --no-fail-on-empty-changeset
ok "CloudFormation stack deployed"

# ---------------------------------------------------------------------------
# Step 7: Retrieve and display stack outputs
# ---------------------------------------------------------------------------
info "Retrieving stack outputs..."
OUTPUTS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs' \
  --output json)

API_ENDPOINT=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="ApiEndpoint") | .OutputValue')
FUNCTION_NAME=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="LambdaFunctionName") | .OutputValue')
LOG_GROUP=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="LogGroupName") | .OutputValue')

echo
info "============================================="
info "  Deployment Complete"
info "============================================="
ok "API Endpoint:      ${API_ENDPOINT}"
ok "Lambda Function:   ${FUNCTION_NAME}"
ok "Log Group:         ${LOG_GROUP}"
echo
info "Test the API:"
info "  curl ${API_ENDPOINT}/health"
info "  curl ${API_ENDPOINT}/api/v1/chefs"
echo
info "View logs:"
info "  aws logs tail ${LOG_GROUP} --region ${REGION} --follow"
echo
info "Tear down:"
info "  aws cloudformation delete-stack --stack-name ${STACK_NAME} --region ${REGION}"
info "  aws s3 rb s3://${S3_BUCKET} --force --region ${REGION}"
info "  aws dsql delete-cluster --identifier ${DSQL_CLUSTER_ID} --region ${REGION}"
