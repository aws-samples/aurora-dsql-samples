package org.example;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.retries.StandardRetryStrategy;
import software.amazon.awssdk.retries.api.BackoffStrategy;
import software.amazon.awssdk.services.dsql.DsqlClient;
import software.amazon.awssdk.services.dsql.model.DeleteClusterRequest;
import software.amazon.awssdk.services.dsql.model.DeleteClusterResponse;
import software.amazon.awssdk.services.dsql.model.ResourceNotFoundException;

import java.time.Duration;

public class DeleteCluster {

    public static void main(String[] args) {
        Region region = Region.US_EAST_1;
        String clusterId = "<your cluster id>";

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
