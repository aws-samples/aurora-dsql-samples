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
 * Deletes a single-region cluster in Amazon Aurora DSQL
 */
void DeleteCluster(const Aws::String& region, const Aws::String& identifier) {
    // Create client for the specified region
    DSQL::DSQLClientConfiguration clientConfig;
    clientConfig.region = region;
    DSQL::DSQLClient client(clientConfig);
    
    // Delete the cluster
    DeleteClusterRequest deleteRequest;
    deleteRequest.SetIdentifier(identifier);
    
    auto deleteOutcome = client.DeleteCluster(deleteRequest);
    if (!deleteOutcome.IsSuccess()) {
        std::cerr << "Failed to delete cluster " << identifier << " in " << region << ": " 
                  << deleteOutcome.GetError().GetMessage() << std::endl;
        throw std::runtime_error("Unable to delete cluster " + identifier + " in " + region);
    }
    
    auto cluster = deleteOutcome.GetResult();
    std::cout << "Initiated delete of " << cluster.GetArn() << std::endl;
}

//#define STANDALONE_MODE
#ifdef STANDALONE_MODE
int main() {
    Aws::String region = "us-east-1";
    Aws::String clusterId = "";

    if (const char* env_var = std::getenv("CLUSTER_REGION")) {
        region = env_var;
    } 
    if (const char* env_var = std::getenv("CLUSTER_ID")) {
        clusterId = env_var;
    } else {
        std::cout << "Please set the CLUSTER_ID environment variable" << std::endl;
        return -1;
    }

    Aws::SDKOptions options;
    Aws::InitAPI(options);
    {
        try {            
            DeleteCluster(region, clusterId);
            
            std::cout << "Deleted " << clusterId << std::endl;
        }
        catch (const std::exception& e) {
            std::cerr << "Error: " << e.what() << std::endl;
        }
    }
    Aws::ShutdownAPI(options);
    return 0;
}
#endif // STANDALONE_MODE
