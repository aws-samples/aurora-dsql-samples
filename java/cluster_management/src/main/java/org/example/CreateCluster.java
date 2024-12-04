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
import software.amazon.awssdk.services.dsql.model.ClusterStatus;
import software.amazon.awssdk.services.dsql.model.CreateClusterRequest;
import software.amazon.awssdk.services.dsql.model.CreateClusterResponse;

import java.util.HashMap;
import java.util.Map;

public class CreateCluster {

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

        boolean deletionProtectionEnabled = true;
        Map<String, String> tags = new HashMap<>();
        tags.put("Name", "FooBar");

        String identifier = createCluster(client, deletionProtectionEnabled, tags);
        System.out.println("Cluster Id: " + identifier);
    }

    public static String createCluster(DsqlClient client, boolean deletionProtectionEnabled, Map<String, String> tags) throws Exception {
        CreateClusterRequest createClusterRequest = CreateClusterRequest
                .builder()
                .deletionProtectionEnabled(deletionProtectionEnabled)
                .tags(tags)
                .build();
        CreateClusterResponse res = client.createCluster(createClusterRequest);
        if (res.status() == ClusterStatus.CREATING) {
            return res.identifier();
        } else {
            throw new Exception("Failed to create cluster");
        }
    }
}
