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
IMAGE_TAG="latest"
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

echo "==> Waiting for cluster to become ACTIVE"
until [[ "$(aws dsql get-cluster --region "$REGION" --identifier "$CLUSTER_ID" \
        --query status --output text)" == "ACTIVE" ]]; do
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
docker build -t "${ECR_URI}:${IMAGE_TAG}" "$PROJECT_DIR"
docker push "${ECR_URI}:${IMAGE_TAG}"
put_state ECR_URI "$ECR_URI"

# ---------------------------------------------------------------------------
# 5. ECS Express Mode service
# ---------------------------------------------------------------------------
echo "==> Creating ECS Express Mode service $APP_NAME"
# IAM roles are eventually consistent; retry the first create if it races.
for attempt in 1 2 3; do
  if aws ecs create-express-gateway-service \
      --region "$REGION" \
      --service-name "$APP_NAME" \
      --execution-role-arn "$EXEC_ROLE_ARN" \
      --infrastructure-role-arn "$INFRA_ROLE_ARN" \
      --task-role-arn "$TASK_ROLE_ARN" \
      --health-check-path "/health" \
      --primary-container "{\"image\":\"${ECR_URI}:${IMAGE_TAG}\",\"containerPort\":${CONTAINER_PORT},\"environment\":[{\"name\":\"DSQL_ENDPOINT\",\"value\":\"${DSQL_ENDPOINT}\"},{\"name\":\"DSQL_USER\",\"value\":\"app_runtime\"},{\"name\":\"PORT\",\"value\":\"${CONTAINER_PORT}\"},{\"name\":\"APP_JWT_SECRET\",\"value\":\"${APP_JWT_SECRET}\"}]}" \
      --monitor-resources; then
    break
  fi
  echo "    create attempt $attempt failed (role propagation?), retrying in 30s"
  sleep 30
done

echo
echo "Deploy complete."
echo "  DSQL endpoint : $DSQL_ENDPOINT"
echo "  App URL       : https://${APP_NAME}.ecs.${REGION}.on.aws/  (see describe output above)"
echo
echo "Next: run  DSQL_ENDPOINT=$DSQL_ENDPOINT AWS_REGION=$REGION scripts/setup-db.sh"
