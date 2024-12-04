import { DSQLClient } from "@aws-sdk/client-dsql";
import { GetClusterCommand } from "@aws-sdk/client-dsql";

async function getCluster(clusterId, client) {
    const getClusterCommand = new GetClusterCommand({
      identifier: clusterId,
    });

    try {
      return await client.send(getClusterCommand);
    } catch (error) {
      if (error.name === "ResourceNotFoundException") {
        console.log("Cluster ID not found or deleted");
      } else {
        console.error("Unable to poll cluster status:", error.message);
      }
      throw error;
    }
  }

async function main() {
    const region = "us-east-1";
    const client = new DSQLClient({ region });

    const clusterId = "foo0bar1baz2quux3quuux4";

    const response = await getCluster(clusterId, client); 
    console.log("Cluster Status:", response.status);

}

main();
