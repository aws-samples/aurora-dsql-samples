package org.example;

import org.junit.jupiter.api.*;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dsql.DsqlClient;
import software.amazon.awssdk.services.dsql.model.ClusterStatus;
import software.amazon.awssdk.services.dsql.model.GetClusterResponse;
import software.amazon.awssdk.utils.builder.SdkBuilder;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.logging.Logger;

public class DsqlClusterManagementTest {

    private static final Logger logger = Logger.getLogger(DsqlClusterManagementTest.class.getSimpleName());

    private static Region region1;
    private static Region region2;
    private static Region witnessRegion;

    private static DsqlClient client1;
    private static DsqlClient client2;

    @BeforeAll
    static void setup() {
        Map<String, String> env = System.getenv();
        region1 = Region.of(env.getOrDefault("REGION_1", "us-east-1"));
        region2 = Region.of(env.getOrDefault("REGION_2", "us-east-2"));
        witnessRegion = Region.of(env.getOrDefault("WITNESS_REGION", "us-west-2"));

        logger.info(String.format(
                "Executing tests with REGION_1=%s REGION_2=%s WITNESS_REGION=%s",
                region1, region2, witnessRegion
                ));

        client1 = createClient(region1);
        client2 = createClient(region2);
    }

    @AfterAll
    static void teardown() {
        try {
            if (System.getenv().containsKey("IS_CI")) {
                logger.info("This is a CI run. Scanning for leaked clusters");
                logger.info("Deleting test clusters in " + region1);
                deleteTestsClusters(client1);

                logger.info("Deleting test clusters in " + region2);
                deleteTestsClusters(client2);
            } else {
                logger.info("This is not a CI run. Skipping leaked cluster cleanup");
            }
        } finally {
            client1.close();
            client2.close();
        }
    }

    @Test
    public void singleRegionClusterLifecycle() {
        logger.info("Starting single region cluster lifecycle run");
        GetClusterResponse cluster = CreateCluster.example(client1);
        logger.info("Created " + cluster);

        logger.info("Disabling deletion protection");
        UpdateCluster.example(client1, cluster.identifier(), false);

        GetClusterResponse updatedCluster = GetCluster.example(client1, cluster.identifier());
        logger.info("Cluster after update: " + updatedCluster);

        logger.info("Deleting " + cluster.arn());
        DeleteCluster.example(client1, cluster.identifier());
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

    /**
     * Delete all clusters that are:
     * <ol>
     *     <li>Not already deleting; and,</li>
     *     <li>Tagged with 'Repo=aws-samples/aurora-dsql-samples'; and,</li>
     *     <li>Tagged with 'Name=java *'</li>
     * </ol>
     */
    static void deleteTestsClusters(DsqlClient client) {
        List<GetClusterResponse> clustersToDelete = client
                .listClustersPaginator(SdkBuilder::build)
                .clusters()
                .stream()
                .map(summary -> client.getCluster(r -> r.identifier(summary.identifier())))
                .filter(c -> !Set.of(ClusterStatus.DELETED, ClusterStatus.DELETING).contains(c.status()))
                .filter(GetClusterResponse::hasTags)
                .filter(c -> {
                    var tags = c.tags();
                    boolean isTestCluster = tags.getOrDefault("Repo", "").equals("aws-samples/aurora-dsql-samples") &&
                            tags.getOrDefault("Name", "").startsWith("java ");
                    return isTestCluster;
                })
                .toList();

        logger.info(String.format("Found %d clusters to delete", clustersToDelete.size()));
        for (GetClusterResponse cluster : clustersToDelete) {
            if (cluster.deletionProtectionEnabled()) {
                logger.info("Disabling deletion protection on " + cluster.arn());
                client.updateCluster(r -> r.identifier(cluster.identifier()).deletionProtectionEnabled(false));
            }
            logger.info("Deleting " + cluster);
            client.deleteCluster(r -> r.identifier(cluster.identifier()));
            logger.info("Deleted " + cluster.arn());
        }
    }

    static DsqlClient createClient(Region region) {
        return DsqlClient.builder()
                .region(region)
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();
    }
}
