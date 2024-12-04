package org.example;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.retries.StandardRetryStrategy;
import software.amazon.awssdk.services.dsql.DsqlClient;
import software.amazon.awssdk.services.dsql.model.CreateMultiRegionClustersRequest;
import software.amazon.awssdk.services.dsql.model.CreateMultiRegionClustersResponse;
import software.amazon.awssdk.services.dsql.model.LinkedClusterProperties;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class CreateMultiRegionCluster {

    public static void main(String[] args) throws Exception {
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

        List<String> linkedRegionList = Arrays.asList(region.toString(), "us-east-2");
        String witnessRegion = "us-west-2";
        Map<String, LinkedClusterProperties> clusterProperties = new HashMap<String, LinkedClusterProperties>() {{
            put("us-east-1", LinkedClusterProperties.builder()
                    .tags(new HashMap<String, String>() {{
                        put("Name", "Foo");
                    }})
                    .build());
            put("us-east-2", LinkedClusterProperties.builder()
                    .tags(new HashMap<String, String>() {{
                        put("Name", "Bar");
                    }})
                    .build());
        }};
        List<String> linkedClusterArns = createMultiRegionCluster(client, linkedRegionList, witnessRegion, clusterProperties);
        System.out.println("Linked Cluster ARNs: " + linkedClusterArns);
    }

    public static List<String> createMultiRegionCluster(DsqlClient client, List<String> linkedRegionList, String witnessRegion, Map<String, LinkedClusterProperties> clusterProperties) throws Exception {
        CreateMultiRegionClustersRequest createMultiRegionClustersRequest = CreateMultiRegionClustersRequest
                .builder()
                .linkedRegionList(linkedRegionList)
                .witnessRegion(witnessRegion)
                .clusterProperties(clusterProperties)
                .build();

        CreateMultiRegionClustersResponse response = client.createMultiRegionClusters(createMultiRegionClustersRequest);

        if (response.linkedClusterArns() != null) {
            return response.linkedClusterArns();
        } else {
            throw new Exception("Failed to create multi-region cluster");
        }
    }
}
