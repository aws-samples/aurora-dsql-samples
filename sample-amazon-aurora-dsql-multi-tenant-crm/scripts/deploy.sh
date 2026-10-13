#!/usr/bin/env bash
#
# deploy.sh -- provision the multi-tenant CRM POC. Designed to run in AWS
# CloudShell (AWS CLI, Docker, git, and credentials are pre-installed).
#
# It is idempotent: it records created resource identifiers in scripts/.state.env
# and skips steps that are already done, so you can re-run it safely.
#
# Steps:
#   1. Create an Aurora DSQL cluster (deletion protection off for easy teardown).
#   2. Create the application task role (dsql:DbConnect on the cluster).
#   3. Create the two ECS Express Mode prerequisite roles.
#   4. Build the container image and push it to Amazon ECR.
#   5. Create the ECS Express Mode service.
#
# After this runs, execute scripts/setup-db.sh once to create tables and the
# least-privilege app_runtime database role.
#
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
APP_NAME="crm-dsql-poc"
ECR_REPO="${APP_NAME}"
# A unique tag per run. With a fixed "latest" tag, updating an existing service
# leaves the task definition pointing at an unchanged image reference, so ECS
# has no reason to pull and new code never ships.
IMAGE_TAG="$(date -u +%Y%m%d%H%M%S)"
CONTAINER_PORT=3000

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
STATE_FILE="$SCRIPT_DIR/.state.env"
touch "$STATE_FILE"
# shellcheck disable=SC1090
source "$STATE_FILE"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

put_state() { # key value
  grep -v "^$1=" "$STATE_FILE" > "$STATE_FILE.tmp" 2>/dev/null || true
  mv "$STATE_FILE.tmp" "$STATE_FILE" 2>/dev/null || true
  echo "$1=$2" >> "$STATE_FILE"
}

echo "==> Region=$REGION Account=$ACCOUNT_ID"

# Record the Region alongside the resource ids. cleanup.sh reads this rather
# than the ambient AWS_REGION, so a later shell defaulting to a different
# Region cannot report success while leaving the stack running.
put_state DEPLOY_REGION "$REGION"

# ---------------------------------------------------------------------------
# 1. Aurora DSQL cluster
# ---------------------------------------------------------------------------
if [[ -z "${CLUSTER_ID:-}" ]]; then
  echo "==> Creating Aurora DSQL cluster"
  CLUSTER_ID="$(aws dsql create-cluster \
    --region "$REGION" \
    --no-deletion-protection-enabled \
    --tags Name="$APP_NAME" \
    --query identifier --output text)"
  put_state CLUSTER_ID "$CLUSTER_ID"
else
  echo "==> Reusing DSQL cluster $CLUSTER_ID"
fi

# Wait for the cluster to be usable, with a ceiling.
#
# ACTIVE, IDLE and INACTIVE are all connectable: Aurora DSQL parks an unused
# cluster and wakes it on the next connection. Waiting for ACTIVE alone means a
# re-run against a cluster that has been idle for a while spins for the full
# timeout and then exits 1, even though the cluster is perfectly usable.
#
# A failed or deleted cluster, or a get-cluster that keeps erroring, must abort
# instead of spinning.
echo "==> Waiting for cluster to become available"
WAIT_DEADLINE=$(( SECONDS + 600 ))
while :; do
  CLUSTER_STATUS="$(aws dsql get-cluster --region "$REGION" \
    --identifier "$CLUSTER_ID" --query status --output text 2>/dev/null || echo "UNKNOWN")"
  case "$CLUSTER_STATUS" in
    ACTIVE|IDLE|INACTIVE)
      echo "    status: $CLUSTER_STATUS"
      break
      ;;
    FAILED|DELETING|DELETED)
      echo "ERROR: cluster $CLUSTER_ID is $CLUSTER_STATUS; cannot continue." >&2
      exit 1
      ;;
  esac
  if (( SECONDS >= WAIT_DEADLINE )); then
    echo "ERROR: cluster $CLUSTER_ID did not become available within 10 minutes." >&2
    echo "       last status: $CLUSTER_STATUS" >&2
    exit 1
  fi
  sleep 5
done
DSQL_ENDPOINT="${CLUSTER_ID}.dsql.${REGION}.on.aws"
put_state DSQL_ENDPOINT "$DSQL_ENDPOINT"
CLUSTER_ARN="arn:aws:dsql:${REGION}:${ACCOUNT_ID}:cluster/${CLUSTER_ID}"
echo "    endpoint: $DSQL_ENDPOINT"

# Secret used to sign/verify tenant bearer tokens. Generated once and reused on
# re-runs (the state file is sourced at the top, so a prior value is already in
# the environment). For a POC an environment variable is adequate; a production
# service should store this in AWS Secrets Manager and inject it as a secret.
if [[ -z "${APP_JWT_SECRET:-}" ]]; then
  APP_JWT_SECRET="$(openssl rand -hex 32)"
  put_state APP_JWT_SECRET "$APP_JWT_SECRET"
fi

# ---------------------------------------------------------------------------
# 2. Application task role (least-privilege: dsql:DbConnect only)
# ---------------------------------------------------------------------------
TASK_ROLE_NAME="${APP_NAME}-task-role"
if ! aws iam get-role --role-name "$TASK_ROLE_NAME" >/dev/null 2>&1; then
  echo "==> Creating application task role $TASK_ROLE_NAME"
  aws iam create-role --role-name "$TASK_ROLE_NAME" \
    --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{"Effect":"Allow",
        "Principal":{"Service":"ecs-tasks.amazonaws.com"},
        "Action":"sts:AssumeRole"}]}' >/dev/null
fi
aws iam put-role-policy --role-name "$TASK_ROLE_NAME" \
  --policy-name dsql-connect \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[{\"Effect\":\"Allow\",
      \"Action\":\"dsql:DbConnect\",
      \"Resource\":\"${CLUSTER_ARN}\"}]}"
TASK_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${TASK_ROLE_NAME}"
put_state TASK_ROLE_ARN "$TASK_ROLE_ARN"

# ---------------------------------------------------------------------------
# 3. ECS Express Mode prerequisite roles
# ---------------------------------------------------------------------------
if ! aws iam get-role --role-name ecsTaskExecutionRole >/dev/null 2>&1; then
  echo "==> Creating ecsTaskExecutionRole"
  aws iam create-role --role-name ecsTaskExecutionRole \
    --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{"Effect":"Allow",
        "Principal":{"Service":"ecs-tasks.amazonaws.com"},
        "Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
fi
if ! aws iam get-role --role-name ecsInfrastructureRoleForExpressServices >/dev/null 2>&1; then
  echo "==> Creating ecsInfrastructureRoleForExpressServices"
  aws iam create-role --role-name ecsInfrastructureRoleForExpressServices \
    --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{"Effect":"Allow",
        "Principal":{"Service":"ecs.amazonaws.com"},
        "Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name ecsInfrastructureRoleForExpressServices \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSInfrastructureRoleforExpressGatewayServices
fi
EXEC_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/ecsTaskExecutionRole"
INFRA_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/ecsInfrastructureRoleForExpressServices"

# ---------------------------------------------------------------------------
# 4. Build and push the container image
# ---------------------------------------------------------------------------
echo "==> Ensuring ECR repository $ECR_REPO"
aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$REGION" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "$ECR_REPO" --region "$REGION" >/dev/null
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}"

echo "==> Logging in to ECR and building image"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
# --platform is explicit because ECS Express Mode runs x86_64. Without it, a
# build on an arm64 workstation (Apple Silicon) produces an image the service
# cannot start.
docker build --platform linux/amd64 -t "${ECR_URI}:${IMAGE_TAG}" "$PROJECT_DIR"
docker push "${ECR_URI}:${IMAGE_TAG}"
put_state ECR_URI "$ECR_URI"

# ---------------------------------------------------------------------------
# 5. ECS Express Mode service
# ---------------------------------------------------------------------------
PRIMARY_CONTAINER="{\"image\":\"${ECR_URI}:${IMAGE_TAG}\",\"containerPort\":${CONTAINER_PORT},\"environment\":[{\"name\":\"DSQL_ENDPOINT\",\"value\":\"${DSQL_ENDPOINT}\"},{\"name\":\"DSQL_USER\",\"value\":\"app_runtime\"},{\"name\":\"PORT\",\"value\":\"${CONTAINER_PORT}\"},{\"name\":\"APP_JWT_SECRET\",\"value\":\"${APP_JWT_SECRET}\"}]}"
SERVICE_ARN="arn:aws:ecs:${REGION}:${ACCOUNT_ID}:service/default/${APP_NAME}"

# --monitor-resources is deliberately omitted: it opens an interactive viewer
# that blocks the script until the operator presses q, and it clears the output
# this script tells the reader to look at.
if aws ecs describe-express-gateway-service --region "$REGION" \
     --service-arn "$SERVICE_ARN" >/dev/null 2>&1; then
  echo "==> Updating existing ECS Express Mode service $APP_NAME"
  aws ecs update-express-gateway-service \
    --region "$REGION" \
    --service-arn "$SERVICE_ARN" \
    --primary-container "$PRIMARY_CONTAINER"
else
  echo "==> Creating ECS Express Mode service $APP_NAME"
  # IAM roles are eventually consistent; retry the first create if it races.
  CREATED=0
  for attempt in 1 2 3; do
    if aws ecs create-express-gateway-service \
        --region "$REGION" \
        --service-name "$APP_NAME" \
        --execution-role-arn "$EXEC_ROLE_ARN" \
        --infrastructure-role-arn "$INFRA_ROLE_ARN" \
        --task-role-arn "$TASK_ROLE_ARN" \
        --health-check-path "/health" \
        --primary-container "$PRIMARY_CONTAINER"; then
      CREATED=1
      break
    fi
    echo "    create attempt $attempt failed (role propagation?), retrying in 30s"
    sleep 30
  done
  # Previously the loop could exhaust all three attempts and the script would
  # still print "Deploy complete".
  if [[ "$CREATED" -ne 1 ]]; then
    echo "ERROR: could not create the ECS Express Mode service after 3 attempts." >&2
    echo "       Re-run this script, or inspect the service in the ECS console." >&2
    exit 1
  fi
fi

echo
echo "Deploy complete."
echo "  DSQL endpoint : $DSQL_ENDPOINT"
echo "  Image tag     : $IMAGE_TAG"
echo "  App URL       : run 'aws ecs describe-express-gateway-service --region $REGION --service-arn $SERVICE_ARN' for the endpoint"
echo
echo "Next: run  DSQL_ENDPOINT=$DSQL_ENDPOINT AWS_REGION=$REGION scripts/setup-db.sh"
