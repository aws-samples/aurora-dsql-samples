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

int testSingleRegion() {
    std::cout << "Starting single region cluster lifecycle run" << std::endl; 
    const int wait_for_cluster_seconds = 30; // Just an approximate arbitrarily chosen time
    const int wait_for_cluster_update_seconds = 5; // Just an approximate arbitrarily chosen time
    
    Aws::String region = "us-east-1";
    if (const char* env_var = std::getenv("CLUSTER_1_REGION")) {
        region = env_var;
        std::cout << "Region from environment: " <<  region << std::endl;
    } 

    auto cluster = CreateCluster(region);
    std::cout << "Created single region cluster: " <<  cluster.GetArn() << std::endl;
    auto clusterId = cluster.GetIdentifier();

    std::this_thread::sleep_for(std::chrono::seconds(wait_for_cluster_seconds));

    std::cout << "Disabling deletion protection" << std::endl;

    Aws::Map<Aws::String, Aws::String> updateParams;
    updateParams["identifier"] = clusterId;
    updateParams["deletion_protection_enabled"] = "false";
    auto updatedCluster = UpdateCluster(region, updateParams);
    std::cout << "Updated " << updatedCluster.GetArn() << std::endl;

    auto retrievedCluster = GetCluster(region, clusterId);
    std::cout << "Cluster after update: "  << ClusterStatusMapper::GetNameForClusterStatus(retrievedCluster.GetStatus()) << std::endl;
  
    std::this_thread::sleep_for(std::chrono::seconds(wait_for_cluster_update_seconds));

    std::cout << "Deleting " <<  cluster.GetArn() << std::endl;
    DeleteCluster(region, clusterId);
    std::cout << "Finished single region cluster lifecycle run" << std::endl; 

    return 0;
}

int testMultiRegion() {
    std::cout << "Starting multi region cluster lifecycle run" << std::endl; 

    const int wait_for_cluster_seconds = 30; // Just an approximate arbitrarily chosen time
    const int wait_for_cluster_update_seconds = 5; // Just an approximate arbitrarily chosen time

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

    std::this_thread::sleep_for(std::chrono::seconds(wait_for_cluster_seconds));

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

    std::this_thread::sleep_for(std::chrono::seconds(wait_for_cluster_update_seconds));

    std::cout << "Deleting clusters " <<  std::endl;
    DeleteMultiRegionClusters(region1, cluster1Id, region2, cluster2Id);
            
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
        testSingleRegion();
    } catch (const std::runtime_error& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        testStatus = -1;
    }

    try {
        testMultiRegion();
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

