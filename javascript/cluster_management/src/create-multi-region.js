import { DSQLClient } from "@aws-sdk/client-dsql"; 
import { CreateMultiRegionClustersCommand } from "@aws-sdk/client-dsql"; 

async function createMultiRegionCluster(client, linkedRegionList, witnessRegion, clusterProperties) {
    const createMultiRegionClustersCommand = new CreateMultiRegionClustersCommand({
        linkedRegionList: linkedRegionList,
        witnessRegion: witnessRegion,
        clusterProperties: clusterProperties
    });
    try {
        const response = await client.send(createMultiRegionClustersCommand);
        return response;
    } catch (error) {
        console.error("Failed to create multi-region cluster: ", error.message);
    }
}

async function main() {
    const region = "us-east-1";
    const client = new DSQLClient({
        region
    });
    const linkedRegionList = ["us-east-1", "us-east-2"];
    const witnessRegion = "us-west-2";
    const clusterProperties = {
        "us-east-1": { tags: { "Name": "Foo" }, deletionProtectionEnabled: true },
        "us-east-2": { tags: { "Name": "Bar" }, deletionProtectionEnabled: true }
    };

    const response = await createMultiRegionCluster(client, linkedRegionList, witnessRegion, clusterProperties);
    console.log("Linked Cluster ARNs:", response.linkedClusterArns);
}

main();
