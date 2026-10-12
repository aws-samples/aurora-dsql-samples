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

# Tracks whether anything failed. A real failure must not be reported as
# "already deleted", and must not lead to the state file being removed: losing
# it means losing the cluster id, leaving a billable cluster behind with no
# record of its identifier.
FAILED=0

# Run an AWS CLI delete, tolerating only a genuine "not found" response.
try_delete() {
  local description="$1"
  shift
  local output
  if output="$("$@" 2>&1)"; then
    return 0
  fi
  if grep -qiE "ResourceNotFound|NotFoundException|does not exist|RepositoryNotFound" <<<"$output"; then
    echo "    $description: already gone"
    return 0
  fi
  echo "ERROR: $description failed:" >&2
  echo "$output" | sed 's/^/      /' >&2
  FAILED=1
  return 1
}

# 1. ECS Express Mode service
# --monitor-resources omitted: it opens an interactive viewer that blocks.
SERVICE_ARN="arn:aws:ecs:${REGION}:${ACCOUNT_ID}:service/default/${APP_NAME}"
echo "==> Deleting ECS Express Mode service"
try_delete "delete ECS service" \
  aws ecs delete-express-gateway-service --region "$REGION" \
  --service-arn "$SERVICE_ARN" || true

# 2. Aurora DSQL cluster (deletion protection was disabled at create time)
if [[ -n "${CLUSTER_ID:-}" ]]; then
  echo "==> Deleting DSQL cluster $CLUSTER_ID"
  aws dsql update-cluster --region "$REGION" --identifier "$CLUSTER_ID" \
    --no-deletion-protection-enabled >/dev/null 2>&1 || true
  try_delete "delete DSQL cluster $CLUSTER_ID" \
    aws dsql delete-cluster --region "$REGION" --identifier "$CLUSTER_ID" || true
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
try_delete "delete ECR repository $APP_NAME" \
  aws ecr delete-repository --repository-name "$APP_NAME" --region "$REGION" --force || true

# Note: the shared ecsTaskExecutionRole and ecsInfrastructureRoleForExpressServices
# roles are intentionally left in place -- other services may use them. Delete
# them manually if this was the only workload using them.

if [[ "$FAILED" -ne 0 ]]; then
  echo >&2
  echo "Cleanup INCOMPLETE. One or more resources could not be deleted." >&2
  echo "Keeping $STATE_FILE so you can re-run this script." >&2
  if [[ -n "${CLUSTER_ID:-}" ]]; then
    echo "The DSQL cluster may still exist and continue to bill: ${CLUSTER_ID}" >&2
  fi
  exit 1
fi

rm -f "$STATE_FILE"
echo "Cleanup complete."
