import { DSQLClient, UpdateClusterCommand } from "@aws-sdk/client-dsql";

export async function updateCluster(region, clusterId, deletionProtectionEnabled) {

  const client = new DSQLClient({ region });

  const updateClusterCommand = new UpdateClusterCommand({
    identifier: clusterId,
    deletionProtectionEnabled: deletionProtectionEnabled
  });

  try {
    return await client.send(updateClusterCommand);
  } catch (error) {
    console.error("Unable to update cluster", error.message);
    throw error;
  }
}

async function main() {
  const region = process.env.CLUSTER_REGION || "us-east-1";
  const clusterId = process.env.CLUSTER_ID;

  if (!clusterId) {
    console.error("Error: CLUSTER_ID environment variables must be set");
    process.exit(1);
  }

  const response = await updateCluster(region, clusterId, false);
  console.log(`Updated ${response.arn}`);
}

if (process.env.NODE_ENV !== 'test') {
  main();
}
