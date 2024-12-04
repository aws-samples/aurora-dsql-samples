import { DSQLClient } from "@aws-sdk/client-dsql"; 
import { DeleteClusterCommand } from "@aws-sdk/client-dsql"; 

async function deleteCluster(clusterId, client) {
    const deleteClusterCommand = new DeleteClusterCommand({
      identifier: clusterId,
    });

    try {
      const response = await client.send(deleteClusterCommand);
      return response;
    } catch (error) {
      if (error.name === "ResourceNotFoundException") {
        console.log("Cluster ID not found or already deleted");
      } else {
        console.error("Unable to delete cluster: ", error.message);
      }
      throw error;
    }
  }

async function main() {
    const region = "us-east-1";
    const client = new DSQLClient({ region });

    const clusterId = "foo0bar1baz2quux3quuux4";

    const response = await deleteCluster(clusterId, client); 
    console.log("Deleting Cluster with Id:", clusterId, "- Cluster Status:", response.status);

}

main();
