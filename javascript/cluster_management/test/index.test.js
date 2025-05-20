import { createCluster } from "../src/create_single_region_cluster";
import { updateCluster } from "../src/update_cluster";
import { deleteCluster } from "../src/delete_single_region_cluster";
import { getCluster } from "../src/get_cluster";
import { createMultiRegionCluster } from "../src/create_multi_region_clusters";
import { deleteMultiRegionClusters } from "../src/delete_multi_region_clusters";

const timeout = 600 * 1000; // 10 minutes in milliseconds 

test('Single region cluster test', async function () {

    const region = process.env.CLUSTER_REGION || 'us-east-1';

    console.log("Starting single region cluster lifecycle run");
    let cluster = await createCluster(region);
    console.log("Created " + cluster.arn);

    expect(cluster).toBeDefined();
    expect(cluster.identifier).toBeDefined();

    console.log("Disabling deletion protection");
    await updateCluster(region, cluster.identifier, false);

    const updatedCluster = await getCluster(region, cluster.identifier);
    console.log("Cluster after update: " + JSON.stringify(updatedCluster));

    console.log("Deleting " + cluster.arn);
    await deleteCluster(region, cluster.identifier);
    console.log("Finished single region cluster lifecycle run");

}, timeout);

test('Multi region clusters test', async function () {

    const region1 = process.env.CLUSTER_1_REGION || "us-east-1";
    const region2 = process.env.CLUSTER_2_REGION || "us-east-2";
    const witnessRegion = process.env.WITNESS_REGION || "us-west-2";

    console.log("Starting multi region clusters lifecycle run");
    const { cluster1Id, cluster2Id } = await createMultiRegionCluster(region1, region2, witnessRegion);

    expect(cluster1Id).toBeDefined();
    expect(cluster2Id).toBeDefined();

    console.log(`Disabling deletion protection for cluster 1 ${cluster1Id}`);
    await updateCluster(region1, cluster1Id, false);
    const updatedCluster1 = await getCluster(region1, cluster1Id);
    console.log("Cluster1 after update: " + JSON.stringify(updatedCluster1));

    console.log(`Disabling deletion protection for cluster 2 ${cluster2Id}`);
    await updateCluster(region2, cluster2Id, false);
    const updatedCluster2 = await getCluster(region2, cluster2Id);
    console.log("Cluster2 after update: " + JSON.stringify(updatedCluster2));

    console.log("Deleting multi region clusters");
    await deleteMultiRegionClusters(region1, cluster1Id, region2, cluster2Id);
    console.log("Finished multi region clusters lifecycle run");

}, timeout);
