#!/bin/bash

# Deletes Aurora DSQL clusters older than 1 week that belong to this repo.
# Intended as a safety net for orphaned clusters from failed CI runs.

if [ -z "${IS_CI}" ]; then
  echo "Error: This script is intended to run only in CI environments."
  echo "Set the IS_CI environment variable to run this script."
  exit 1
fi

REGIONS=("us-east-1" "us-east-2")

MAX_AGE_DAYS=7
CUTOFF_DATE=$(date -u -d "$MAX_AGE_DAYS days ago" +%Y-%m-%dT%H:%M:%S)

echo "Deleting clusters older than $MAX_AGE_DAYS days (before $CUTOFF_DATE)"

for region in "${REGIONS[@]}"; do
  echo -e "\nChecking region $region..."
  
  CLUSTERS=$(aws dsql list-clusters --region "$region" --output json)
  CLUSTER_IDS=$(echo "$CLUSTERS" | jq -r '.clusters[].identifier')
  
  if [ -z "$CLUSTER_IDS" ]; then
    echo "No clusters found"
    continue
  fi
  
  for cluster_id in $CLUSTER_IDS; do
    CLUSTER=$(aws dsql get-cluster --region "$region" --identifier "$cluster_id" --output json 2>/dev/null) || continue
    
    STATUS=$(echo "$CLUSTER" | jq -r '.status')
    REPO_TAG=$(echo "$CLUSTER" | jq -r '.tags.Repo // empty')
    CREATED=$(echo "$CLUSTER" | jq -r '.creationTime')
    
    if [ "$STATUS" = "DELETING" ] || [ "$STATUS" = "DELETED" ]; then
      continue
    fi
    
    if [ "$REPO_TAG" != "aws-samples/aurora-dsql-samples" ]; then
      continue
    fi
    
    if [[ "$CREATED" > "$CUTOFF_DATE" ]]; then
      echo "Skipping $cluster_id (created $CREATED, too recent)"
      continue
    fi
    
    echo "Deleting $cluster_id (created $CREATED)..."
    aws dsql update-cluster --region "$region" --identifier "$cluster_id" --no-deletion-protection-enabled 2>/dev/null || true
    aws dsql delete-cluster --region "$region" --identifier "$cluster_id"
  done
done
