package org.example;

import java.time.Duration;
import java.util.Optional;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.retries.api.BackoffStrategy;
import software.amazon.awssdk.services.dsql.DsqlClient;
import software.amazon.awssdk.services.dsql.model.DeleteClusterResponse;

public class DeleteCluster {

    public static void main(String[] args) {
        Region region = Region.of(System.getenv().getOrDefault("CLUSTER_REGION", "us-east-1"));
        String clusterId = Optional.ofNullable(System.getenv("CLUSTER_ID"))
                .orElseThrow(() -> new IllegalStateException("Expected CLUSTER_ID in environment"));

        try (
                DsqlClient client = DsqlClient.builder()
                        .region(region)
                        .credentialsProvider(DefaultCredentialsProvider.create())
                        .build()
        ) {
            example(client, clusterId);
        }
    }

    public static void example(DsqlClient client, String clusterId) {
        DeleteClusterResponse cluster = client.deleteCluster(r -> r.identifier(clusterId));
        System.out.println("Initiated delete of " + cluster.arn());

        // The DSQL SDK offers a built-in waiter to poll for deletion.
        System.out.println("Waiting for cluster to finish deletion");
        client.waiter().waitUntilClusterNotExists(
                getCluster -> getCluster.identifier(clusterId),
                config -> config.backoffStrategyV2(
                        BackoffStrategy.fixedDelayWithoutJitter(Duration.ofSeconds(10))
                ).waitTimeout(Duration.ofMinutes(5))
        );
        System.out.println("Deleted " + cluster.arn());
    }
}
