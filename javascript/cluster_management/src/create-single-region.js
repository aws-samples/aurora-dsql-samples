import { DSQLClient } from "@aws-sdk/client-dsql";
import { CreateClusterCommand } from "@aws-sdk/client-dsql";

async function createCluster(client, tags, deletionProtectionEnabled) {
    const createClusterCommand = new CreateClusterCommand({
        deletionProtectionEnabled: deletionProtectionEnabled,
        tags,
    });
    try {
        const response = await client.send(createClusterCommand);
        return response;
    } catch (error) {
        console.error("Failed to create cluster: ", error.message);
    }
}

async function main() {
    const region = "us-east-1";
    const client = new DSQLClient({ region });
    const tags = { Name: "FooBar"};
    const deletionProtectionEnabled = true;

    const response = await createCluster(client, tags, deletionProtectionEnabled);
    console.log("Cluster Id:", response.identifier);
}

main();
