/*
 * Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 *
 */
package org.example;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.core.retry.RetryMode;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dsql.DsqlClient;
import software.amazon.awssdk.services.dsql.model.*;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.example.ConnectionUtil.createClient;
import static org.example.CreateCluster.createCluster;
import static org.example.CreateMultiRegionCluster.createMultiRegionCluster;
import static org.example.DeleteCluster.deleteCluster;
import static org.example.DeleteMultiRegionClusters.deleteMultiRegionClusters;
import static org.example.GetCluster.getCluster;
import static org.example.UpdateCluster.updateCluster;

public class Example {

    public static void main(String[] args) throws Exception {
        Region region = Region.US_EAST_1;
        DsqlClient client = createClient(region);

        singleRegionExample(client);

        multiRegionExample(client);
    }

    /**
     * Creates a DSQL cluster, retrieves its info (getCluster) updates it to remove deletion protection, then deletes it.
     *
     * @param client DsqlClient
     */
    private static void singleRegionExample(DsqlClient client) throws Exception {
        boolean deletionProtectionEnabled = true;
        Map<String, String> tags = new HashMap<>();
        tags.put("Name", "FooBar");

        String identifier = createCluster(client, deletionProtectionEnabled, tags);
        System.out.println("Cluster Id: " + identifier);


        GetClusterResponse getResponse = getCluster(identifier, client);
        System.out.println("cluster status: " + getResponse.status());

        boolean deletionProtectionUpdateValue = false;
        UpdateClusterResponse updateResponse = updateCluster(identifier, deletionProtectionUpdateValue, client);
        System.out.println("Deletion Protection updating to: " + deletionProtectionUpdateValue + ", Status: " + updateResponse.status());

        DeleteClusterResponse response = deleteCluster(identifier, client);
        System.out.println("Deleting Cluster with ID: " + identifier + ", Status: " + response.status());
    }

    /**
     * Creates a multi-region DSQL cluster in us-east-1 and us-east-2, then deletes it.
     *
     * @param client DsqlClient
     */
    private static void multiRegionExample(DsqlClient client) throws Exception {
        List<String> linkedRegionList = Arrays.asList("us-east-1", "us-east-2");
        String witnessRegion = "us-west-2";
        Map<String, LinkedClusterProperties> clusterProperties = new HashMap<String, LinkedClusterProperties>() {{
            put("us-east-1", LinkedClusterProperties.builder()
                    .tags(new HashMap<String, String>() {{
                        put("Name", "Foo");
                    }})
                    .deletionProtectionEnabled(false)
                    .build());
            put("us-east-2", LinkedClusterProperties.builder()
                    .tags(new HashMap<String, String>() {{
                        put("Name", "Bar");
                    }})
                    .deletionProtectionEnabled(false)
                    .build());
        }};
        List<String> linkedClusterArns = createMultiRegionCluster(client, linkedRegionList, witnessRegion, clusterProperties);
        System.out.println("Linked Cluster ARNs: " + linkedClusterArns);

        deleteMultiRegionClusters(linkedClusterArns, client);
        System.out.println("Deleting Clusters with ARNs: " + linkedClusterArns);
    }


}
