package org.example;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.retries.api.BackoffStrategy;
import software.amazon.awssdk.services.dsql.DsqlClient;
import software.amazon.awssdk.services.dsql.model.CreateClusterRequest;
import software.amazon.awssdk.services.dsql.model.CreateClusterResponse;
import software.amazon.awssdk.services.dsql.model.GetClusterResponse;

import java.time.Duration;
import java.util.Map;

public class CreateCluster {

    public static void main(String[] args) {
        Region region = Region.of(System.getenv().getOrDefault("REGION_1", "us-east-1"));

        try (
                DsqlClient client = DsqlClient.builder()
                        .region(region)
                        .credentialsProvider(DefaultCredentialsProvider.create())
                        .build()
        ) {
            GetClusterResponse cluster = example(client);
            System.out.println("Created " + cluster);
        }
    }

    public static GetClusterResponse example(DsqlClient client) {
        CreateClusterRequest request = CreateClusterRequest.builder()
                .deletionProtectionEnabled(true)
                .tags(Map.of(
                        "Name", "java single region cluster",
                        "Repo", "aws-samples/aurora-dsql-samples"
                ))
                .build();
        CreateClusterResponse cluster = client.createCluster(request);
        System.out.println("Created " + cluster.arn());

        // The DSQL SDK offers a built-in waiter to poll for a cluster's
        // transition to ACTIVE.
        System.out.println("Waiting for cluster to become ACTIVE");
        GetClusterResponse activeCluster = client.waiter().waitUntilClusterActive(
                getCluster -> getCluster.identifier(cluster.identifier()),
                config -> config.backoffStrategyV2(
                        BackoffStrategy.fixedDelayWithoutJitter(Duration.ofSeconds(10))
                ).waitTimeout(Duration.ofMinutes(5))
        ).matched().response().orElseThrow();
        System.out.println("Cluster is ACTIVE: " + activeCluster);

        return activeCluster;
    }
}
