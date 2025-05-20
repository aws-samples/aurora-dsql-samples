package org.example;

import java.util.Optional;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dsql.DsqlClient;
import software.amazon.awssdk.services.dsql.model.UpdateClusterResponse;

public class UpdateCluster {

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
            UpdateClusterResponse cluster = example(client, clusterId, false);
            System.out.println("Updated " + cluster.arn());
        }
    }

    public static UpdateClusterResponse example(
            DsqlClient client,
            String clusterId,
            boolean setDeletionProtection) {
        return client.updateCluster(r -> r.identifier(clusterId).deletionProtectionEnabled(setDeletionProtection));
    }
}
