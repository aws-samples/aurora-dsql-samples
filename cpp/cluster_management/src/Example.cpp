/* Copyright 2024 Amazon.com, Inc. or its affiliates.
 * Licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License. */

#include <aws/core/Aws.h>
#include <aws/dsql/DSQLClient.h>
#include <chrono>
#include <thread>
#include <stdexcept>

#include "CreateSingleRegion.h"
#include "DeleteSingleRegion.h"
#include "GetCluster.h"
#include "UpdateCluster.h"
#include "CreateMultiRegion.h"
#include "DeleteMultiRegion.h"

using namespace Aws;
using namespace Aws::DSQL;
using namespace Aws::DSQL::Model;


DSQLClient createClient(const Aws::String& region) {
    DSQLClientConfiguration clientConfig;
    clientConfig.region = region;

    DSQLClient client(clientConfig);
    std::cout << "Client created successfully for region: " << region << std::endl;

    return client;
}

int singleRegion(DSQLClient& client) {
    const int wait_for_cluster_seconds = 180; // Just an approximate arbitrarily chosen time
    const int wait_for_cluster_update_seconds = 20; // Just an approximate arbitrarily chosen time
    bool deletionProtectionEnabled = true;
    std::map<Aws::String, Aws::String> tags = {
        { "Name", "ExampleClusterCpp" }
    };

    String clusterId = createCluster(client, deletionProtectionEnabled, tags);
    if (clusterId == "") {
        throw std::runtime_error("createCluster failed.");
    }
    std::this_thread::sleep_for(std::chrono::seconds(wait_for_cluster_seconds));

    ClusterStatus status = getCluster(clusterId, client);
    if (status == ClusterStatus::NOT_SET) {
        throw std::runtime_error("getCluster failed.");
    }

    deletionProtectionEnabled = false;
    status = updateCluster(clusterId, deletionProtectionEnabled, client);
    if (ClusterStatusMapper::GetNameForClusterStatus(status) != "UPDATING") {
        throw std::runtime_error("updateCluster failed.");
    }
    std::this_thread::sleep_for(std::chrono::seconds(wait_for_cluster_update_seconds));

    std::cout << " deleting cluster: " << clusterId << std::endl;
    status = deleteCluster(clusterId, client);
    if (ClusterStatusMapper::GetNameForClusterStatus(status) != "DELETING") {
        throw std::runtime_error("deleteCluster failed.");
    }   

    return 0;
}

int multiRegion(DSQLClient& client) {
    const int wait_for_cluster_seconds = 180; // Just an approximate arbitrarily chosen time
    std::vector<Aws::String> linkedRegionList = { "us-east-1", "us-east-2" };
    Aws::String witnessRegion = "us-west-2";

    LinkedClusterProperties usEast1Properties;
    usEast1Properties.SetTags({
        { "Name", "Foo" }
    });
    usEast1Properties.SetDeletionProtectionEnabled(false);
    LinkedClusterProperties usEast2Properties;
    usEast2Properties.SetTags({
        { "Name", "Bar" }
    });
    usEast2Properties.SetDeletionProtectionEnabled(false);
    Aws::Map<Aws::String, LinkedClusterProperties> clusterProperties = {
        { "us-east-1", usEast1Properties },
        { "us-east-2", usEast2Properties }
    };

    std::vector<Aws::String> linkedArns = createMultiRegionCluster(client, linkedRegionList, witnessRegion, clusterProperties);
    std::cout << "Linked Cluster ARNs: " << std::endl;
    for (const auto& arn : linkedArns) {
        std::cout << arn << std::endl;
    }
    if (linkedArns.size() < 2) {
        throw std::runtime_error("createMultiRegionCluster failed.");
    }
    std::this_thread::sleep_for(std::chrono::seconds(wait_for_cluster_seconds));

    std::vector<Aws::String> deletedArns = deleteMultiRegionClusters(linkedArns, client);
    if (deletedArns.empty()) {
        throw std::runtime_error("deleteMultiRegionClusters failed.");
    }

    std::cout << "Deleted Cluster ARNs: " << std::endl;
    for (const auto& arn : deletedArns) {
            std::cout << arn << std::endl;
    }

    return 0;
}

int main(int argc, char *argv[]) {
    const std::string region = "us-east-1";
    int testStatus = 0;

    Aws::SDKOptions options;
    Aws::InitAPI(options);
    DSQLClient client = createClient(region);

    try {
        singleRegion(client);
    } catch (const std::runtime_error& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        testStatus = -1;
    }
    
    try {
        multiRegion(client);
    } catch (const std::runtime_error& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        testStatus = -1;
    }

    std::cout << " shutting down API " << std::endl;
    Aws::ShutdownAPI(options);

    if (testStatus == 0) {
        std::cout << "Cluster management cpp test passed" << std::endl;
    } else {
        std::cout << "Cluster management cpp test failed" << std::endl;
    }

    return testStatus;
}

