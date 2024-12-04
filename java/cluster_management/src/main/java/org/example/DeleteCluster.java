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
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.retries.StandardRetryStrategy;
import software.amazon.awssdk.services.dsql.DsqlClient;
import software.amazon.awssdk.services.dsql.model.DeleteClusterRequest;
import software.amazon.awssdk.services.dsql.model.DeleteClusterResponse;
import software.amazon.awssdk.services.dsql.model.ResourceNotFoundException;

public class DeleteCluster {

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

        DeleteClusterResponse response = deleteCluster(cluster_id, client);
        System.out.println("Deleting Cluster with ID: " + cluster_id + ", Status: " + response.status());
    }

    public static DeleteClusterResponse deleteCluster(String cluster_id, DsqlClient client) {
        DeleteClusterRequest deleteClusterRequest = DeleteClusterRequest.builder()
                .identifier(cluster_id)
                .build();
        try {
            return client.deleteCluster(deleteClusterRequest);
        } catch (ResourceNotFoundException rnfe) {
            System.out.println("Cluster id is not found / deleted");
            throw rnfe;
        } catch (Exception e) {
            System.out.println("Unable to poll cluster status: " + e.getMessage());
            throw e;
        }
    }
}
