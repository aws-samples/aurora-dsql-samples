package org.example;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.retries.StandardRetryStrategy;
import software.amazon.awssdk.services.dsql.DsqlClient;
import software.amazon.awssdk.services.dsql.model.GetClusterRequest;
import software.amazon.awssdk.services.dsql.model.GetClusterResponse;
import software.amazon.awssdk.services.dsql.model.ResourceNotFoundException;

public class GetCluster {

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

        GetClusterResponse response = getCluster(cluster_id, client);
        System.out.println("cluster status: " + response.status());
    }

    public static GetClusterResponse getCluster(String cluster_id, DsqlClient client) {
        GetClusterRequest getClusterRequest = GetClusterRequest.builder()
                .identifier(cluster_id)
                .build();
        try {
            return client.getCluster(getClusterRequest);
        } catch (ResourceNotFoundException rnfe) {
            System.out.println("Cluster id is not found / deleted");
            throw rnfe;
        } catch (Exception e) {
            System.out.println(("Unable to poll cluster status: " + e.getMessage()));
            throw e;
        }
    }
}
