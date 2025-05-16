import { DSQLClient, GetClusterCommand } from "@aws-sdk/client-dsql";

export async function getCluster(region, clusterId) {

  const client = new DSQLClient({ region });

  const getClusterCommand = new GetClusterCommand({
    identifier: clusterId,
  });

  try {
    return await client.send(getClusterCommand);
  } catch (error) {
    if (error.name === "ResourceNotFoundException") {
      console.log("Cluster ID not found or deleted");
    }
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

  const response = await getCluster(region, clusterId);
  console.log("Cluster: ", response);
}

if (process.env.NODE_ENV !== 'test') {
  main();
}
