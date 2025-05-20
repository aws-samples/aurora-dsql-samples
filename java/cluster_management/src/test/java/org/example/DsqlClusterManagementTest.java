package org.example;

import java.util.List;
import java.util.Map;
import java.util.logging.Logger;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dsql.DsqlClient;
import software.amazon.awssdk.services.dsql.model.GetClusterResponse;

public class DsqlClusterManagementTest {

    private static final Logger logger = Logger.getLogger(DsqlClusterManagementTest.class.getSimpleName());

    // Single Region Cluster
    private static Region region;
    private static DsqlClient client;

    // Multi Region Clusters
    private static Region region1;
    private static Region region2;
    private static Region witnessRegion;

    private static DsqlClient client1;
    private static DsqlClient client2;

    @BeforeAll
    static void setup() {
        Map<String, String> env = System.getenv();
        
        region = Region.of(env.getOrDefault("CLUSTER_REGION", "us-east-1"));
        region1 = Region.of(env.getOrDefault("CLUSTER_1_REGION", "us-east-1"));
        region2 = Region.of(env.getOrDefault("CLUSTER_2_REGION", "us-east-2"));
        witnessRegion = Region.of(env.getOrDefault("WITNESS_REGION", "us-west-2"));

        logger.info(String.format(
                "Executing tests with CLUSTER_1_REGION=%s CLUSTER_2_REGION=%s WITNESS_REGION=%s",
                region1, region2, witnessRegion
                ));

        client = createClient(region);
        client1 = createClient(region1);
        client2 = createClient(region2);
    }

    @AfterAll
    static void teardown() {
        client.close();
        client1.close();
        client2.close();
    }

    @Test
    public void singleRegionClusterLifecycle() {
        logger.info("Starting single region cluster lifecycle run");
        GetClusterResponse cluster = CreateCluster.example(client);
        logger.info("Created " + cluster);

        logger.info("Disabling deletion protection");
        UpdateCluster.example(client, cluster.identifier(), false);

        GetClusterResponse updatedCluster = GetCluster.example(client, cluster.identifier());
        logger.info("Cluster after update: " + updatedCluster);

        logger.info("Deleting " + cluster.arn());
        DeleteCluster.example(client, cluster.identifier());
        logger.info("Finished single region cluster lifecycle run");
    }

    @Test
    public void multiRegionClusterLifecycle() {
        logger.info("Starting multi region cluster lifecycle run");
        List<GetClusterResponse> clusters = CreateMultiRegionClusters.example(client1, client2, witnessRegion);
        logger.info("Created: " + clusters.stream().map(GetClusterResponse::arn).toList());

        GetClusterResponse cluster1 = clusters.get(0);
        GetClusterResponse cluster2 = clusters.get(1);

        logger.info("Disabling deletion protection");
        UpdateCluster.example(client1, cluster1.identifier(), false);
        UpdateCluster.example(client2, cluster2.identifier(), false);

        logger.info("Deleting clusters");
        DeleteMultiRegionClusters.example(client1, cluster1.identifier(), client2, cluster2.identifier());
        logger.info("Finished multi region cluster lifecycle run");
    }

    static DsqlClient createClient(Region region) {
        return DsqlClient.builder()
                .region(region)
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();
    }
}
