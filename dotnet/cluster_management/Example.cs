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

using Amazon.DSQL;
using Amazon;
using Amazon.DSQL.Model;
using Amazon.Runtime;

class Example {
    public static async Task ExecuteSingleRegion() {
        RegionEndpoint region = RegionEndpoint.USEast1;

        // Create Single region Cluster
        CreateClusterResponse createClusterResponse = await SingleRegionClusterCreation.Create(region);
        System.Diagnostics.Debug.Assert(createClusterResponse.Status == "CREATING");
        System.Diagnostics.Debug.Assert(!string.IsNullOrEmpty(createClusterResponse.Identifier));

        // Wait some time for cluster creation. Waiting time is chosen randomly.
        System.Threading.Thread.Sleep(60*1000);

        // Get Cluster details
        GetClusterResponse getClusterResponse = await GetCluster.Get(region, createClusterResponse.Identifier);
        System.Diagnostics.Debug.Assert(getClusterResponse.Identifier == createClusterResponse.Identifier);

        // Update cluster details by setting delete protection to false
        await UpdateCluster.Update(region, createClusterResponse.Identifier);

        // Delete cluster
        DeleteClusterResponse deleteClusterResponse = await SingleRegionClusterDeletion.Delete(region, createClusterResponse.Identifier);
        System.Diagnostics.Debug.Assert(deleteClusterResponse.Status == "DELETING");
    }

    public static async Task ExecuteMultiRegion() {
        RegionEndpoint region = RegionEndpoint.USEast1;

        // Create Single region Cluster
        CreateMultiRegionClustersResponse createMultiRegionClustersResponse = 
            await MultiRegionClusterCreation.Create(region);
        System.Diagnostics.Debug.Assert(createMultiRegionClustersResponse.LinkedClusterArns.Count == 2);

        // Wait some time for cluster creation. Waiting time is chosen randomly.
        System.Threading.Thread.Sleep(90*1000);

        await MultiRegionClusterDeletion.Delete(region, createMultiRegionClustersResponse.LinkedClusterArns);
    }
}
