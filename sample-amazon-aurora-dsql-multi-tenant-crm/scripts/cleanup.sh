#!/usr/bin/env bash
#
# cleanup.sh -- delete everything deploy.sh created. Run from AWS CloudShell.
#
# WARNING: this permanently deletes the Aurora DSQL cluster and all CRM data.
# This action cannot be undone.
#
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
APP_NAME="crm-dsql-poc"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_FILE="$SCRIPT_DIR/.state.env"
[[ -f "$STATE_FILE" ]] && source "$STATE_FILE" || true
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

echo "This will DELETE the DSQL cluster ${CLUSTER_ID:-<none>} and the ECS service."
read -r -p "Type 'delete' to continue: " CONFIRM
[[ "$CONFIRM" == "delete" ]] || { echo "Aborted."; exit 1; }

# 1. ECS Express Mode service
SERVICE_ARN="arn:aws:ecs:${REGION}:${ACCOUNT_ID}:service/default/${APP_NAME}"
echo "==> Deleting ECS Express Mode service"
aws ecs delete-express-gateway-service --region "$REGION" \
  --service-arn "$SERVICE_ARN" --monitor-resources 2>/dev/null || \
  echo "    service not found or already deleted"

# 2. Aurora DSQL cluster (deletion protection was disabled at create time)
if [[ -n "${CLUSTER_ID:-}" ]]; then
  echo "==> Deleting DSQL cluster $CLUSTER_ID"
  aws dsql update-cluster --region "$REGION" --identifier "$CLUSTER_ID" \
    --no-deletion-protection-enabled 2>/dev/null || true
  aws dsql delete-cluster --region "$REGION" --identifier "$CLUSTER_ID" || \
    echo "    cluster not found or already deleted"
fi

# 3. IAM task role
TASK_ROLE_NAME="${APP_NAME}-task-role"
if aws iam get-role --role-name "$TASK_ROLE_NAME" >/dev/null 2>&1; then
  echo "==> Deleting task role $TASK_ROLE_NAME"
  aws iam delete-role-policy --role-name "$TASK_ROLE_NAME" --policy-name dsql-connect 2>/dev/null || true
  aws iam delete-role --role-name "$TASK_ROLE_NAME" 2>/dev/null || true
fi

# 4. ECR repository
echo "==> Deleting ECR repository $APP_NAME"
aws ecr delete-repository --repository-name "$APP_NAME" --region "$REGION" --force 2>/dev/null || \
  echo "    repository not found"

# Note: the shared ecsTaskExecutionRole and ecsInfrastructureRoleForExpressServices
# roles are intentionally left in place -- other services may use them. Delete
# them manually if this was the only workload using them.

rm -f "$STATE_FILE"
echo "Cleanup complete."
