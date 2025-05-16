import { DSQLClient, DeleteClusterCommand, waitUntilClusterNotExists } from "@aws-sdk/client-dsql";

export async function deleteMultiRegionClusters(region1, cluster1Id, region2, cluster2Id) {

    const client1 = new DSQLClient({ region: region1 });
    const client2 = new DSQLClient({ region: region2 });

    try {
        const deleteClusterCommand1 = new DeleteClusterCommand({
            identifier: cluster1Id,
        });
        const response1 = await client1.send(deleteClusterCommand1);

        const deleteClusterCommand2 = new DeleteClusterCommand({
            identifier: cluster2Id,
        });
        const response2 = await client2.send(deleteClusterCommand2);

        console.log(`Waiting for cluster1 ${response1.identifier} to finish deletion`);
        await waitUntilClusterNotExists(
            {
                client: client1,
                maxWaitTime: 300 // Wait for 5 minutes
            },
            {
                identifier: response1.identifier
            }
        );
        console.log(`Cluster1 Id ${response1.identifier} is now deleted`);

        console.log(`Waiting for cluster2 ${response2.identifier} to finish deletion`);
        await waitUntilClusterNotExists(
            {
                client: client2,
                maxWaitTime: 300 // Wait for 5 minutes
            },
            {
                identifier: response2.identifier
            }
        );
        console.log(`Cluster2 Id ${response2.identifier} is now deleted`);
        return;
    } catch (error) {
        if (error.name === "ResourceNotFoundException") {
            console.log("Some or all Cluster ARNs not found or already deleted");
        } else {
            console.error("Unable to delete multi-region clusters: ", error.message);
        }
        throw error;
    }
}

async function main() {
    const region1 = process.env.CLUSTER_1_REGION || "us-east-1";
    const cluster1Id = process.env.CLUSTER_1_ID;
    const region2 = process.env.CLUSTER_2_REGION || "us-east-2";
    const cluster2Id = process.env.CLUSTER_2_ID;

    if (!cluster1_id || !cluster2_id) {
        console.error("Error: CLUSTER_1_ID and CLUSTER_2_ID environment variables must be set");
        process.exit(1);
    }

    await deleteMultiRegionClusters(region1, cluster1Id, region2, cluster2Id);
    console.log(`Deleted ${cluster1Id} in ${region1} and ${cluster2Id} in ${region2}`);
}

if (process.env.NODE_ENV !== 'test') {
    main();
}
