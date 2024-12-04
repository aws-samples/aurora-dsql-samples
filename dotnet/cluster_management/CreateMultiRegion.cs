/*
 * Copyright 2024 Amazon.com, Inc. or its affiliates.
 * Licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

using Amazon;
using Amazon.DSQL;
using Amazon.DSQL.Model;
using Amazon.Runtime;

class MultiRegionClusterCreation {
    public static async Task<CreateMultiRegionClustersResponse> Create(RegionEndpoint region)
    {
        // Create the sdk client
        AWSCredentials aWSCredentials = FallbackCredentialsFactory.GetCredentials();
        AmazonDSQLConfig clientConfig = new()
        {
            AuthenticationServiceName = "dsql",
            RegionEndpoint = region
        };
        AmazonDSQLClient client = new(aWSCredentials, clientConfig);


        // Create multi region cluster
        LinkedClusterProperties USEast1Props = new() {
            DeletionProtectionEnabled = false,
            Tags = new Dictionary<string, string>
            {
                { "Name", "use1-example-cluster" },
                { "Usecase", "testing-mr-use1" }
            }
        };

        LinkedClusterProperties USEast2Props = new() {
            DeletionProtectionEnabled = false,
            Tags = new Dictionary<string, string>
            {
                { "Name", "use2-example-cluster" },
                { "Usecase", "testing-mr-use2" }
            }
        };

        CreateMultiRegionClustersRequest createMultiRegionClustersRequest = new()
        {
            LinkedRegionList = new List<string> { "us-east-1", "us-east-2" },
            WitnessRegion = "us-west-2",
            ClusterProperties = new Dictionary<string, LinkedClusterProperties>
            {
                { "us-east-1", USEast1Props },
                { "us-east-2", USEast2Props }
            }
        };

        CreateMultiRegionClustersResponse createMultiRegionClustersResponse = 
            await client.CreateMultiRegionClustersAsync(createMultiRegionClustersRequest);

        foreach (string arn in createMultiRegionClustersResponse.LinkedClusterArns) {
            Console.WriteLine(arn);
        }

        return createMultiRegionClustersResponse;
    }
}

