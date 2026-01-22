import { DSQLClient, CreateClusterCommand, waitUntilClusterActive } from "@aws-sdk/client-dsql";

export async function createCluster(region) {

    const client = new DSQLClient({ region });

    try {
        const createClusterCommand = new CreateClusterCommand({
            deletionProtectionEnabled: true,
            tags: {
                Name: "javascript single region cluster",
                Repo: process.env.GITHUB_REPOSITORY || "local",
                Type: "cluster-management",
                RunId: process.env.GITHUB_RUN_ID || "local"
            },
        });
        const response = await client.send(createClusterCommand);

        console.log(`Waiting for cluster ${response.identifier} to become ACTIVE`);
        await waitUntilClusterActive(
            {
                client: client,
                maxWaitTime: 300 // Wait for 5 minutes
            },
            {
                identifier: response.identifier
            }
        );
        console.log(`Cluster Id ${response.identifier} is now active`);
        return response;
    } catch (error) {
        console.error(`Unable to create cluster in ${region}: `, error.message);
        throw error;
    }
}

async function main() {
    const region = process.env.CLUSTER_REGION || "us-east-1";
    const cluster = await createCluster(region);
    console.log(`Created ${cluster}`);
}

if (process.env.NODE_ENV !== 'test') {
    main();
}
