package org.example;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dsql.DsqlClient;
import software.amazon.awssdk.services.dsql.model.GetClusterResponse;

public class GetCluster {

    public static void main(String[] args) {
        Region region = Region.US_EAST_1;
        String clusterId = "<your cluster id>";

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
