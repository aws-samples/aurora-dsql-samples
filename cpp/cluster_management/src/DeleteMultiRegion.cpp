#include <aws/core/Aws.h>
#include <aws/core/utils/Outcome.h>
#include <aws/dsql/DSQLClient.h>
#include <aws/dsql/model/DeleteClusterRequest.h>
#include <aws/dsql/model/GetClusterRequest.h>
#include <iostream>
#include <thread>
#include <chrono>

using namespace Aws;
using namespace Aws::DSQL;
using namespace Aws::DSQL::Model;

/**
 * Deletes multi-region clusters in Amazon Aurora DSQL
 */
void DeleteMultiRegionClusters(
    const Aws::String& region1,
    const Aws::String& clusterId1,
    const Aws::String& region2,
    const Aws::String& clusterId2) {
    
    // Create clients for each region
    DSQL::DSQLClientConfiguration clientConfig1;
    clientConfig1.region = region1;
    DSQL::DSQLClient client1(clientConfig1);
    
    DSQL::DSQLClientConfiguration clientConfig2;
    clientConfig2.region = region2;
    DSQL::DSQLClient client2(clientConfig2);
    
    // Delete the first cluster
    std::cout << "Deleting cluster " << clusterId1 << " in " << region1 << std::endl;
    
    DeleteClusterRequest deleteRequest1;
    deleteRequest1.SetIdentifier(clusterId1);
    
    auto deleteOutcome1 = client1.DeleteCluster(deleteRequest1);
    if (!deleteOutcome1.IsSuccess()) {
        std::cerr << "Failed to delete cluster " << clusterId1 << " in " << region1 << ": " 
                  << deleteOutcome1.GetError().GetMessage() << std::endl;
        throw std::runtime_error("Failed to delete multi-region clusters");
    }
    
    // cluster1 will stay in PENDING_DELETE state until cluster2 is deleted
    std::cout << "Deleting cluster " << clusterId2 << " in " << region2 << std::endl;
    
    DeleteClusterRequest deleteRequest2;
    deleteRequest2.SetIdentifier(clusterId2);
    
    auto deleteOutcome2 = client2.DeleteCluster(deleteRequest2);
    if (!deleteOutcome2.IsSuccess()) {
        std::cerr << "Failed to delete cluster " << clusterId2 << " in " << region2 << ": " 
                  << deleteOutcome2.GetError().GetMessage() << std::endl;
        throw std::runtime_error("Failed to delete multi-region clusters");
    }
}

//#define STANDALONE_MODE
#ifdef STANDALONE_MODE
int main() {
    Aws::String region1 = "us-east-1";
    Aws::String clusterId1 = "";
    Aws::String region2 = "us-east-2";
    Aws::String clusterId2 = "";

    if (const char* env_var = std::getenv("CLUSTER_1_REGION")) {
        region1 = env_var;
    } 
    if (const char* env_var = std::getenv("CLUSTER_2_REGION")) {
        region2 = env_var;
    } 

    if (const char* env_var = std::getenv("CLUSTER_1_ID")) {
        clusterId1 = env_var;
    } else {
        std::cout << "Please set the CLUSTER_1_ID environment variable" << std::endl;
        return -1;
    }
    if (const char* env_var = std::getenv("CLUSTER_2_ID")) {
        clusterId2 = env_var;
    } else {
        std::cout << "Please set the CLUSTER_2_ID environment variable" << std::endl;
        return -1;
    }

    Aws::SDKOptions options;
    Aws::InitAPI(options);
    {
        try {            
            DeleteMultiRegionClusters(region1, clusterId1, region2, clusterId2);
            
            std::cout << "Deleted " << clusterId1 << " in " << region1 
                      << " and " << clusterId2 << " in " << region2 << std::endl;
        }
        catch (const std::exception& e) {
            std::cerr << "Error: " << e.what() << std::endl;
        }
    }
    Aws::ShutdownAPI(options);
    return 0;
}
#endif // STANDALONE_MODE
