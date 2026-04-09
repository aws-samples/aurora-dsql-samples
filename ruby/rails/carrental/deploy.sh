#!/bin/bash
# =============================================================================
# Car Rental CloudFormation Deploy Script (single-pass)
#
# This script deploys the entire stack in one pass by running the
# CloudFormation deploy in the background while building and pushing the
# Docker image in parallel. The ECR repository is created early in the
# stack (it has no heavy dependencies), while the NAT Gateway and ALB
# take 3-5 minutes — plenty of time for the image push to complete before
# CloudFormation reaches the ECS service resource.
#
# Usage:
#   ./deploy.sh \
#     --account 123456789012 \
#     --region us-east-1 \
#     --vpc-cidr 10.0.0.0/16 \
#     --my-ip 203.0.113.42/32 \
#     --dsql-cluster-id abc123xyz \
#     [--secret-key 'your-rails-secret-key-base']
#
# For a brand-new AWS account, ensure you have:
#   - AWS CLI configured (aws configure)
#   - Docker running locally
#   - Sufficient IAM permissions (see README)
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
STACK_NAME="car-rental-stack"
IMAGE_TAG="latest"
RAILS_SECRET_KEY_BASE=""
AWS_ACCOUNT=""
AWS_REGION=""
VPC_CIDR=""
MY_IP=""
DSQL_CLUSTER_ID=""

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Required:
  --account ID            12-digit AWS Account ID
  --region REGION         AWS region (e.g. us-east-1)
  --vpc-cidr CIDR         VPC CIDR block (e.g. 10.0.0.0/16)
  --my-ip IP[/CIDR]       Your public IP, optionally with CIDR prefix (e.g. 203.0.113.42 or 203.0.113.42/32)
  --dsql-cluster-id ID    Aurora DSQL cluster identifier (e.g. abc123xyz)

Optional:
  --secret-key KEY        Rails SECRET_KEY_BASE (auto-generated if omitted)
  --stack-name NAME       CloudFormation stack name (default: car-rental-stack)
  --image-tag TAG         Docker image tag (default: latest)
  -h, --help              Show this help
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --account)         AWS_ACCOUNT="$2"; shift 2 ;;
    --region)          AWS_REGION="$2"; shift 2 ;;
    --vpc-cidr)        VPC_CIDR="$2"; shift 2 ;;
    --my-ip)           MY_IP="$2"; shift 2 ;;
    --dsql-cluster-id) DSQL_CLUSTER_ID="$2"; shift 2 ;;
    --secret-key)      RAILS_SECRET_KEY_BASE="$2"; shift 2 ;;
    --stack-name)      STACK_NAME="$2"; shift 2 ;;
    --image-tag)       IMAGE_TAG="$2"; shift 2 ;;
    -h|--help)         usage ;;
    *)                 err "Unknown option: $1"; usage ;;
  esac
done

# Validate required args
[[ -z "$AWS_ACCOUNT" ]]     && { err "--account is required"; usage; }
[[ -z "$AWS_REGION" ]]      && { err "--region is required"; usage; }
[[ -z "$VPC_CIDR" ]]        && { err "--vpc-cidr is required"; usage; }
[[ -z "$MY_IP" ]]           && { err "--my-ip is required"; usage; }
[[ -z "$DSQL_CLUSTER_ID" ]] && { err "--dsql-cluster-id is required"; usage; }

# Ensure MY_IP is in CIDR notation (append /32 if no prefix length given)
if [[ "$MY_IP" != */* ]]; then
  MY_IP="${MY_IP}/32"
  info "No CIDR prefix provided for --my-ip; defaulting to ${MY_IP}"
fi

# Generate a secret key if not provided
if [[ -z "$RAILS_SECRET_KEY_BASE" ]]; then
  RAILS_SECRET_KEY_BASE=$(openssl rand -hex 64)
  info "Generated Rails SECRET_KEY_BASE automatically"
fi

TEMPLATE_FILE="$(dirname "$0")/infrastructure/cloudformation.yml"
ECR_REPO_URI="${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com/car-rental-ecr-repo"
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "============================================="
echo "  Car Rental CloudFormation Deployment"
echo "============================================="
echo ""
info "Account:    ${AWS_ACCOUNT}"
info "Region:     ${AWS_REGION}"
info "VPC CIDR:   ${VPC_CIDR}"
info "Allowed IP: ${MY_IP}"
info "DSQL ID:    ${DSQL_CLUSTER_ID}"
info "Stack:      ${STACK_NAME}"
info "Image Tag:  ${IMAGE_TAG}"
info "ECR Repo:   ${ECR_REPO_URI}"
echo ""


# ---------------------------------------------------------------------------
# Step 0: Prerequisite checks
# ---------------------------------------------------------------------------
info "Checking prerequisites..."

if ! command -v aws &>/dev/null; then
  err "AWS CLI not found. Install: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
  exit 1
fi
ok "AWS CLI found: $(aws --version 2>&1 | head -1)"

if ! command -v docker &>/dev/null; then
  err "Docker not found. Install: https://docs.docker.com/get-docker/"
  exit 1
fi
if ! docker info &>/dev/null; then
  err "Docker daemon is not running. Please start Docker Desktop."
  exit 1
fi
ok "Docker found and running"

if ! command -v jq &>/dev/null; then
  err "jq not found. Install: https://jqlang.github.io/jq/download/"
  exit 1
fi
ok "jq found"

# Verify AWS credentials
CALLER_IDENTITY=$(aws sts get-caller-identity --region "$AWS_REGION" 2>&1) || {
  err "AWS credentials not configured or invalid."
  err "Run: aws configure"
  exit 1
}
ok "AWS credentials valid"
info "Identity: $(echo "$CALLER_IDENTITY" | jq -r '.Arn // "unknown"')"

echo ""

# ---------------------------------------------------------------------------
# Step 0b: Check for orphaned resources from a previous failed deploy
# ---------------------------------------------------------------------------
STACK_EXISTS=false
if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" &>/dev/null; then
  STACK_EXISTS=true
fi

if [[ "$STACK_EXISTS" == "false" ]]; then
  # Stack doesn't exist — check if the ECR repo was left behind (e.g. from a
  # deleted stack or a failed CREATE_ROLLBACK). If so, delete it to avoid the
  # ResourceExistenceCheck early-validation error.
  if aws ecr describe-repositories --repository-names car-rental-ecr-repo --region "$AWS_REGION" &>/dev/null; then
    warn "Found orphaned ECR repository 'car-rental-ecr-repo' from a previous deploy."
    info "Deleting it so CloudFormation can recreate it cleanly..."
    aws ecr delete-repository --repository-name car-rental-ecr-repo --region "$AWS_REGION" --force --no-cli-pager >/dev/null 2>&1 || true
    ok "Orphaned ECR repository deleted"
    echo ""
  fi
fi

# ---------------------------------------------------------------------------
# Step 1: Launch CloudFormation deploy in the background
# ---------------------------------------------------------------------------
info "Launching CloudFormation stack '${STACK_NAME}' in the background..."
info "This creates: VPC, subnets, IGW, NAT, security groups, ECR, ECS cluster,"
info "task definition, ALB, target group, and ECS service."
echo ""

CFN_LOG=$(mktemp)
aws cloudformation deploy \
  --template-file "$TEMPLATE_FILE" \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    AwsAccountId="$AWS_ACCOUNT" \
    AwsRegion="$AWS_REGION" \
    VpcCidrBlock="$VPC_CIDR" \
    AllowedPublicIp="$MY_IP" \
    ContainerImageTag="$IMAGE_TAG" \
    DsqlClusterId="$DSQL_CLUSTER_ID" \
    RailsSecretKeyBase="$RAILS_SECRET_KEY_BASE" \
  --tags Project=car-rental Environment=development \
  --no-fail-on-empty-changeset \
  > "$CFN_LOG" 2>&1 &
CFN_PID=$!

info "CloudFormation deploy running in background (PID: ${CFN_PID})"
echo ""

# ---------------------------------------------------------------------------
# Step 2: Wait for the ECR repository to exist, then build & push the image
# ---------------------------------------------------------------------------
info "Waiting for ECR repository to be created by CloudFormation..."

ECR_READY=false
for i in $(seq 1 60); do
  if aws ecr describe-repositories \
       --repository-names car-rental-ecr-repo \
       --region "$AWS_REGION" &>/dev/null; then
    ECR_READY=true
    break
  fi
  # Check if CloudFormation already failed
  if ! kill -0 "$CFN_PID" 2>/dev/null; then
    err "CloudFormation deploy exited before ECR repository was created."
    cat "$CFN_LOG"
    rm -f "$CFN_LOG"
    exit 1
  fi
  sleep 5
done

if [[ "$ECR_READY" != "true" ]]; then
  err "Timed out waiting for ECR repository (5 minutes). Check stack events:"
  err "  aws cloudformation describe-stack-events --stack-name ${STACK_NAME} --region ${AWS_REGION}"
  kill "$CFN_PID" 2>/dev/null || true
  cat "$CFN_LOG"
  rm -f "$CFN_LOG"
  exit 1
fi

ok "ECR repository ready"
echo ""

# ---------------------------------------------------------------------------
# Step 3: Build Docker image (while CloudFormation continues in background)
# ---------------------------------------------------------------------------
info "Building Docker image from project root: ${PROJECT_ROOT}"
info "(CloudFormation is still provisioning NAT Gateway, ALB, etc. in parallel)"
echo ""

docker build -t "car-rental-ecr-repo:${IMAGE_TAG}" "$PROJECT_ROOT"

ok "Docker image built: car-rental-ecr-repo:${IMAGE_TAG}"
echo ""

# ---------------------------------------------------------------------------
# Step 4: Authenticate with ECR and push image
# ---------------------------------------------------------------------------
info "Authenticating with ECR..."

aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com"

ok "ECR authentication successful"

info "Tagging image for ECR..."
docker tag "car-rental-ecr-repo:${IMAGE_TAG}" "${ECR_REPO_URI}:${IMAGE_TAG}"

info "Pushing image to ECR..."
docker push "${ECR_REPO_URI}:${IMAGE_TAG}"

ok "Image pushed: ${ECR_REPO_URI}:${IMAGE_TAG}"
echo ""

# ---------------------------------------------------------------------------
# Step 5: Wait for CloudFormation to finish
# ---------------------------------------------------------------------------
info "Image is in ECR. Waiting for CloudFormation stack to complete..."
echo ""

wait "$CFN_PID"
CFN_EXIT=$?
rm -f "$CFN_LOG"

if [[ $CFN_EXIT -ne 0 ]]; then
  err "CloudFormation deploy failed (exit code: ${CFN_EXIT})."
  err "Check stack events:"
  err "  aws cloudformation describe-stack-events --stack-name ${STACK_NAME} --region ${AWS_REGION} --no-cli-pager"
  exit $CFN_EXIT
fi

ok "CloudFormation stack deployed successfully"
echo ""

# ---------------------------------------------------------------------------
# Step 6: Retrieve and display outputs
# ---------------------------------------------------------------------------
info "Retrieving stack outputs..."
echo ""

STACK_OUTPUTS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --query "Stacks[0].Outputs" \
  --output json 2>/dev/null || echo "[]")

get_output() {
  echo "$STACK_OUTPUTS" | jq -r \
    --arg key "$1" \
    '.[] | select(.OutputKey == $key) | .OutputValue // "unavailable"'
}

ALB_DNS=$(get_output LoadBalancerDNS)
ECR_URI=$(get_output ECRRepositoryUri)
ECS_CLUSTER=$(get_output ECSClusterName)
ECS_SERVICE=$(get_output ECSServiceName)
LOG_GROUP=$(get_output LogGroupName)

echo "============================================="
echo "  Deployment Complete"
echo "============================================="
echo ""
ok "Application URL:  ${ALB_DNS}"
ok "ECR Repository:   ${ECR_URI}"
ok "ECS Cluster:      ${ECS_CLUSTER}"
ok "ECS Service:      ${ECS_SERVICE}"
ok "Log Group:        ${LOG_GROUP}"
echo ""
warn "The ECS task is starting up. It may take 1-2 minutes for the"
warn "health checks to pass and the ALB to begin routing traffic."
warn "The container will run 'rails db:prepare' on first boot to"
warn "create tables in Aurora DSQL."
echo ""
info "Monitor task status:"
echo "  aws ecs describe-services --cluster ${ECS_CLUSTER} --services ${ECS_SERVICE} --region ${AWS_REGION} --query 'services[0].deployments' --no-cli-pager"
echo ""
info "View application logs:"
echo "  aws logs tail ${LOG_GROUP} --region ${AWS_REGION} --follow"
echo ""
info "To tear down everything:"
echo "  aws cloudformation delete-stack --stack-name ${STACK_NAME} --region ${AWS_REGION}"
echo ""
