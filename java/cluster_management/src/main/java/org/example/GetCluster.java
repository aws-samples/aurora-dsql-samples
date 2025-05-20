package org.example;

import java.util.Optional;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dsql.DsqlClient;
import software.amazon.awssdk.services.dsql.model.GetClusterResponse;

public class GetCluster {

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
            GetClusterResponse cluster = client.getCluster(r -> r.identifier(clusterId));
            System.out.println(cluster);
        }
    }

    public static GetClusterResponse example(DsqlClient client, String clusterId) {
        return client.getCluster(r -> r.identifier(clusterId));
    }
}
