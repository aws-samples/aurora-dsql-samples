#!/bin/bash

if [ -z "${IS_CI}" ]; then
  echo "Error: This script is intended to run only in CI environments."
  echo "Running it locally may delete clusters in your account."
  echo "Set the IS_CI environment variable to run this script."
  exit 1
fi

REGIONS=("us-east-1" "us-east-2")

# Region and cluster ID can be extracted from ARN
# ARN format: arn:aws:dsql:REGION:ACCOUNT:cluster/CLUSTER_ID
declare -a ARNS=()
declare -a FILTERED_ARNS=()

# Get clusters from each region and extract ARNs
for region in "${REGIONS[@]}"; do
  echo "Listing clusters in $region..."

  region_arns=$(aws dsql list-clusters --region "$region" | jq -r '.clusters[].arn')

  # Add ARNs to the array if any were found
  if [ -n "$region_arns" ]; then
    while IFS= read -r arn; do
      ARNS+=("$arn")
    done <<< "$region_arns"
  fi
done

echo -e "\nFound ${#ARNS[@]} cluster(s) across all regions:"
printf '%s\n' "${ARNS[@]}"

echo -e "\nFiltering clusters..."
for arn in "${ARNS[@]}"; do
  region=$(echo "$arn" | cut -d':' -f4)
  cluster_id=$(echo "$arn" | cut -d'/' -f2)

  echo "Checking cluster $cluster_id in region $region..."

  cluster_details=$(aws dsql get-cluster --region "$region" --identifier "$cluster_id")

  status=$(echo "$cluster_details" | jq -r '.status')
  repo_tag=$(echo "$cluster_details" | jq -r '.tags.Repo // empty')

  # We only want clusters that are not already deleting, and have the specific repo tag
  if [[ "$status" != "DELETED" && "$status" != "DELETING" && "$repo_tag" == "aws-samples/aurora-dsql-samples" ]]; then
    echo "Cluster $cluster_id qualifies for update (Status: $status, Repo tag: $repo_tag)"
    FILTERED_ARNS+=("$arn")
  else
    echo "Skipping cluster $cluster_id (Status: $status, Repo tag: $repo_tag)"
  fi
done

echo -e "\nFound ${#FILTERED_ARNS[@]} cluster(s) that will be updated and deleted:"
printf '%s\n' "${FILTERED_ARNS[@]}"

# Early exit if no clusters to update
if [ ${#FILTERED_ARNS[@]} -eq 0 ]; then
  echo -e "\nNo clusters to update or delete. Exiting."
  exit 0
fi

echo -e "\nUpdating filtered clusters to disable deletion protection..."
for arn in "${FILTERED_ARNS[@]}"; do
  region=$(echo "$arn" | cut -d':' -f4)
  cluster_id=$(echo "$arn" | cut -d'/' -f2)

  echo "Updating cluster $cluster_id in region $region..."
  aws dsql update-cluster --region "$region" --identifier "$cluster_id" --no-deletion-protection-enabled
  echo "Cluster $cluster_id updated successfully."
done

echo -e "\nDeleting filtered clusters..."
for arn in "${FILTERED_ARNS[@]}"; do
  region=$(echo "$arn" | cut -d':' -f4)
  cluster_id=$(echo "$arn" | cut -d'/' -f2)

  echo "Deleting cluster $cluster_id in region $region..."
  aws dsql delete-cluster --region "$region" --identifier "$cluster_id"
  echo "Deletion initiated for cluster $cluster_id."
done
