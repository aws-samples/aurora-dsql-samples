package org.example;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.retries.StandardRetryStrategy;
import software.amazon.awssdk.services.dsql.DsqlClient;
import software.amazon.awssdk.services.dsql.model.UpdateClusterRequest;
import software.amazon.awssdk.services.dsql.model.UpdateClusterResponse;

public class UpdateCluster {

    public static void main(String[] args) {
        Region region = Region.US_EAST_1;

        ClientOverrideConfiguration clientOverrideConfiguration = ClientOverrideConfiguration.builder()
                .retryStrategy(StandardRetryStrategy.builder().build())
                .build();

        DsqlClient client = DsqlClient.builder()
                .httpClient(UrlConnectionHttpClient.create())
                .overrideConfiguration(clientOverrideConfiguration)
                .region(region)
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();

        String cluster_id = "foo0bar1baz2quux3quuux4";
        Boolean deletionProtectionEnabled = false;

        UpdateClusterResponse response = updateCluster(cluster_id, deletionProtectionEnabled, client);
        System.out.println("Deletion Protection updating to: " + deletionProtectionEnabled.toString() + ", Status: " + response.status());
    }

    public static UpdateClusterResponse updateCluster(String cluster_id, boolean deletionProtectionEnabled, DsqlClient client){
        UpdateClusterRequest updateClusterRequest = UpdateClusterRequest.builder()
                .identifier(cluster_id)
                .deletionProtectionEnabled(deletionProtectionEnabled)
                .build();
        try {
            return client.updateCluster(updateClusterRequest);
        } catch (Exception e) {
            System.out.println(("Unable to update deletion protection: " + e.getMessage()));
            throw e;
        }
    }
}
