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

ClusterStatus WaitForStatus(const Aws::String& region, const Aws::String& clusterId, const ClusterStatus waitStatus, int timeout) {
    std::cout << "Watiting for cluster: " << clusterId << " to reach status: "  << ClusterStatusMapper::GetNameForClusterStatus(waitStatus) << std::endl;
    int interval = 15;  // seconds
    int approximateTimeElapsed = 0;
    ClusterStatus retStatus = ClusterStatus::NOT_SET;
    
    try {
        while (approximateTimeElapsed < timeout) {
            auto clusterInfo = GetCluster(region, clusterId);
            retStatus = clusterInfo.GetStatus();
            std::cout << "Cluster status while waiting is: " << ClusterStatusMapper::GetNameForClusterStatus(retStatus) << std::endl;
            if (retStatus == waitStatus)
            {
                break;
            }
            std::this_thread::sleep_for(std::chrono::seconds(interval));
            approximateTimeElapsed += interval;
        }
    } catch (const std::runtime_error& e) {
        std::cerr << "Error while waiting for status: " << e.what() << std::endl;
        retStatus = ClusterStatus::NOT_SET;
    }

    return retStatus;
}

int TestSingleRegion() {
    std::cout << "Starting single region cluster lifecycle run" << std::endl; 
    const int wait_for_cluster_seconds = 240; // Just an approximate arbitrarily chosen time
    
    Aws::String region = "us-east-1";
    if (const char* env_var = std::getenv("CLUSTER_REGION")) {
        region = env_var;
    } 

    auto cluster = CreateCluster(region);
    std::cout << "Created single region cluster: " <<  cluster.GetArn() << std::endl;
    auto clusterId = cluster.GetIdentifier();
    auto status = WaitForStatus(region, clusterId, ClusterStatus::ACTIVE, wait_for_cluster_seconds);
    if (status != ClusterStatus::ACTIVE && status != ClusterStatus::CREATING) {
        throw std::runtime_error("Cluster "  + clusterId + " did not reach ACTIVE or CREATING status within the expected time.");
    }

    std::cout << "Disabling deletion protection" << std::endl;

    Aws::Map<Aws::String, Aws::String> updateParams;
    updateParams["identifier"] = clusterId;
    updateParams["deletion_protection_enabled"] = "false";
    auto updatedCluster = UpdateCluster(region, updateParams);
    std::cout << "Updated " << updatedCluster.GetArn() << std::endl;

    auto retrievedCluster = GetCluster(region, clusterId);
    std::cout << "Cluster after update: "  << ClusterStatusMapper::GetNameForClusterStatus(retrievedCluster.GetStatus()) << std::endl;

    std::cout << "Deleting " <<  cluster.GetArn() << std::endl;
    DeleteCluster(region, clusterId);
    if(WaitForStatus(region, clusterId, ClusterStatus::DELETING, wait_for_cluster_seconds) != ClusterStatus::DELETING)
    {
        throw std::runtime_error("Cluster "  + clusterId + " did not reach DELETING status within the expected time.");
    }
    std::cout << "Finished single region cluster lifecycle run" << std::endl; 

    return 0;
}

int TestMultiRegion() {
    std::cout << "Starting multi region cluster lifecycle run" << std::endl; 

    const int wait_for_cluster_seconds = 240; // Just an approximate arbitrarily chosen time

    // Define regions for the multi-region setup
    Aws::String region1 = "us-east-1";
    Aws::String region2 = "us-east-2";
    Aws::String witnessRegion = "us-west-2";

    if (const char* env_var = std::getenv("CLUSTER_1_REGION")) {
        region1 = env_var;
        std::cout << "Region 1 from environment: " << region1 << std::endl;
    } 
    if (const char* env_var = std::getenv("CLUSTER_2_REGION")) {
        region2 = env_var;
        std::cout << "Region 2 from environment: " << region2 << std::endl;
    } 
    if (const char* env_var = std::getenv("WITNESS_REGION")) {
        witnessRegion = env_var;
        std::cout << "Witness Region from environment: " << witnessRegion << std::endl;
    }

    auto [cluster1, cluster2] = CreateMultiRegionClusters(region1, region2, witnessRegion);
            
    std::cout << "Created multi region clusters:" << std::endl;
    std::cout << "Cluster 1 ARN: " << cluster1.GetArn() << std::endl;
    std::cout << "Cluster 2 ARN: " << cluster2.GetArn() << std::endl;

    auto cluster1Id = cluster1.GetIdentifier();
    auto cluster2Id = cluster2.GetIdentifier();

    auto status = WaitForStatus(region1, cluster1Id, ClusterStatus::ACTIVE, wait_for_cluster_seconds);
    if (status != ClusterStatus::ACTIVE && status != ClusterStatus::CREATING) {
        throw std::runtime_error("Cluster "  + cluster1Id + " did not reach ACTIVE or CREATING status within the expected time.");
    }

    status = WaitForStatus(region2, cluster2Id, ClusterStatus::ACTIVE, wait_for_cluster_seconds);
    if (status != ClusterStatus::ACTIVE && status != ClusterStatus::CREATING) {
        throw std::runtime_error("Cluster "  + cluster2Id + " did not reach ACTIVE or CREATING status within the expected time.");
    }

    std::cout << "Disabling deletion protection" << std::endl;
    Aws::Map<Aws::String, Aws::String> updateParams;
    updateParams["identifier"] = cluster1Id;
    updateParams["deletion_protection_enabled"] = "false";
    
    auto updatedCluster = UpdateCluster(region1, updateParams);
    std::cout << "Updated " << updatedCluster.GetArn() << std::endl;

    updateParams["identifier"] = cluster2Id;
    updatedCluster = UpdateCluster(region2, updateParams);
    std::cout << "Updated " << updatedCluster.GetArn() << std::endl;

    auto retrievedCluster = GetCluster(region1, cluster1Id);
    std::cout << "Cluster1 after update: " << ClusterStatusMapper::GetNameForClusterStatus(retrievedCluster.GetStatus()) << std::endl;

    retrievedCluster = GetCluster(region2, cluster2Id);
    std::cout << "Cluster2 after update: " << ClusterStatusMapper::GetNameForClusterStatus(retrievedCluster.GetStatus()) << std::endl;

    std::cout << "Deleting clusters " <<  std::endl;
    DeleteMultiRegionClusters(region1, cluster1Id, region2, cluster2Id);

    if(WaitForStatus(region1, cluster1Id, ClusterStatus::DELETING, wait_for_cluster_seconds) != ClusterStatus::DELETING)
    {
        throw std::runtime_error("Cluster "  + cluster1Id + " did not reach DELETING status within the expected time.");
    }
    if(WaitForStatus(region2, cluster2Id, ClusterStatus::DELETING, wait_for_cluster_seconds) != ClusterStatus::DELETING)
    {
        throw std::runtime_error("Cluster "  + cluster2Id + " did not reach DELETING status within the expected time.");
    }
            
    std::cout << "Deleted " << cluster1Id << " in " << region1 
              << " and " << cluster2Id << " in " << region2 << std::endl;

    std::cout << "Finished multi region cluster lifecycle run" << std::endl; 

    return 0;
}

int main(int argc, char *argv[]) {
    int testStatus = 0;
    Aws::SDKOptions options;
    Aws::InitAPI(options);

    try {
        TestSingleRegion();
    } catch (const std::runtime_error& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        testStatus = -1;
    }

    try {
        TestMultiRegion();
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

