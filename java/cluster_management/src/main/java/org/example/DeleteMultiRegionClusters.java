package org.example;

import java.time.Duration;
import java.util.Optional;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.retries.api.BackoffStrategy;
import software.amazon.awssdk.services.dsql.DsqlClient;
import software.amazon.awssdk.services.dsql.DsqlClientBuilder;

public class DeleteMultiRegionClusters {

    public static void main(String[] args) {
        Region region1 = Region.of(System.getenv().getOrDefault("CLUSTER_1_REGION", "us-east-1"));
        String clusterId1 = Optional.ofNullable(System.getenv("CLUSTER_1_ID"))
                .orElseThrow(() -> new IllegalStateException("Expected CLUSTER_1_ID in environment"));
        Region region2 = Region.of(System.getenv().getOrDefault("CLUSTER_2_REGION", "us-east-1"));
        String clusterId2 = Optional.ofNullable(System.getenv("CLUSTER_2_ID"))
                .orElseThrow(() -> new IllegalStateException("Expected CLUSTER_2_ID in environment"));

        DsqlClientBuilder clientBuilder = DsqlClient.builder()
                .credentialsProvider(DefaultCredentialsProvider.create());

        try (
            DsqlClient client1 = clientBuilder.region(region1).build();
            DsqlClient client2 = clientBuilder.region(region2).build()
        ) {
            example(client1, clusterId1, client2, clusterId2);
        }
    }

    public static void example(DsqlClient client1, String clusterId1, DsqlClient client2, String clusterId2) {
        System.out.printf("Deleting cluster %s in %s%n", clusterId1, client1.serviceClientConfiguration().region());
        client1.deleteCluster(r -> r.identifier(clusterId1));

        // cluster1 will stay in PENDING_DELETE until cluster2 is deleted.

        System.out.printf("Deleting cluster %s in %s%n", clusterId2, client2.serviceClientConfiguration().region());
        client2.deleteCluster(r -> r.identifier(clusterId2));

        // Now that both clusters have been marked for deletion they will transition
        // to DELETING state and finalize deletion.
        System.out.printf("Waiting for cluster %s to finish deletion%n", clusterId1);
        client1.waiter().waitUntilClusterNotExists(
                getCluster -> getCluster.identifier(clusterId1),
                config -> config.backoffStrategyV2(
                        BackoffStrategy.fixedDelayWithoutJitter(Duration.ofSeconds(10))
                ).waitTimeout(Duration.ofMinutes(5))
        );

        System.out.printf("Waiting for cluster %s to finish deletion%n", clusterId2);
        client2.waiter().waitUntilClusterNotExists(
                getCluster -> getCluster.identifier(clusterId2),
                config -> config.backoffStrategyV2(
                        BackoffStrategy.fixedDelayWithoutJitter(Duration.ofSeconds(10))
                ).waitTimeout(Duration.ofMinutes(5))
        );

        System.out.printf("Deleted %s in %s and %s in %s%n",
                clusterId1, client1.serviceClientConfiguration().region(),
                clusterId2, client2.serviceClientConfiguration().region());
    }
}
