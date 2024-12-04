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
import software.amazon.awssdk.services.dsql.model.DeleteMultiRegionClustersRequest;

import java.util.Arrays;
import java.util.List;

public class DeleteMultiRegionClusters {

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

        List<String> linkedClusterArns = Arrays.asList(
                "arn:aws:dsql:us-east-1:111111999999::cluster/foo0bar1baz2quux3quuux4",
                "arn:aws:dsql:us-east-2:111111999999::cluster/bar0foo1baz2quux3quuux4"
        );

        deleteMultiRegionClusters(linkedClusterArns, client);
        System.out.println("Deleting Clusters with ARNs: " + linkedClusterArns);
    }

    public static void deleteMultiRegionClusters(List<String> linkedClusterArns, DsqlClient client) {
        DeleteMultiRegionClustersRequest deleteMultiRegionClustersRequest = DeleteMultiRegionClustersRequest.builder()
                .linkedClusterArns(linkedClusterArns)
                .build();

        try {
            client.deleteMultiRegionClusters(deleteMultiRegionClustersRequest);
        } catch (Exception e) {
            System.out.println("Unable to delete multi-region clusters: " + e.getMessage());
            throw e;
        }
    }
}
