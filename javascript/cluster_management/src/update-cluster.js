import { DSQLClient } from "@aws-sdk/client-dsql"; 
import { UpdateClusterCommand } from "@aws-sdk/client-dsql"; 

export async function updateCluster(clusterId, deletionProtectionEnabled, client) {
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
    const region = "us-east-1";
    const client = new DSQLClient({ region });

    const clusterId = "foo0bar1baz2quux3quuux4";
    const deletionProtectionEnabled = true;

    const response = await updateCluster(clusterId, deletionProtectionEnabled, client); 
    console.log("Deletion Protection Updating to:" + deletionProtectionEnabled, "- Cluster Status:", response.status);

}

main();
