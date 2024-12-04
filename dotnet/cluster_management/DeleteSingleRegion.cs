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

class SingleRegionClusterDeletion {
    public static async Task<DeleteClusterResponse> Delete(RegionEndpoint region, string clusterId)
    {
        // Create the sdk client
        AWSCredentials aWSCredentials = FallbackCredentialsFactory.GetCredentials();
        AmazonDSQLConfig clientConfig = new()
        {
            AuthenticationServiceName = "dsql",
            RegionEndpoint = region
        };
        AmazonDSQLClient client = new(aWSCredentials, clientConfig);

        // Delete a single region cluster
        DeleteClusterRequest deleteClusterRequest = new()
        {
            Identifier = clusterId
        };
        DeleteClusterResponse deleteClusterResponse = await client.DeleteClusterAsync(deleteClusterRequest);
        Console.WriteLine(deleteClusterResponse.Status);

        return deleteClusterResponse;        
    }
}
