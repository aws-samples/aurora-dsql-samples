#include <aws/core/Aws.h>
#include <aws/core/utils/Outcome.h>
#include <aws/dsql/DSQLClient.h>
#include <aws/dsql/model/UpdateClusterRequest.h>
#include <iostream>

using namespace Aws;
using namespace Aws::DSQL;
using namespace Aws::DSQL::Model;

/**
 * Updates a cluster in Amazon Aurora DSQL
 */
UpdateClusterResult UpdateCluster(const Aws::String& region, const Aws::Map<Aws::String, Aws::String>& updateParams) {
    // Create client for the specified region
    DSQL::DSQLClientConfiguration clientConfig;
    clientConfig.region = region;
    DSQL::DSQLClient client(clientConfig);
    
    // Create update request
    UpdateClusterRequest updateRequest;
    
    // Set identifier (required)
    if (updateParams.find("identifier") != updateParams.end()) {
        updateRequest.SetIdentifier(updateParams.at("identifier"));
    } else {
        throw std::runtime_error("Cluster identifier is required for update operation");
    }
    
    // Set deletion protection if specified
    if (updateParams.find("deletion_protection_enabled") != updateParams.end()) {
        bool deletionProtection = (updateParams.at("deletion_protection_enabled") == "true");
        updateRequest.SetDeletionProtectionEnabled(deletionProtection);
    }
    
    // Execute the update
    auto updateOutcome = client.UpdateCluster(updateRequest);
    if (!updateOutcome.IsSuccess()) {
        std::cerr << "Failed to update cluster: " << updateOutcome.GetError().GetMessage() << std::endl;
        throw std::runtime_error("Unable to update cluster");
    }
    
    return updateOutcome.GetResult();
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
            // Create parameter map
            Aws::Map<Aws::String, Aws::String> updateParams;
            updateParams["identifier"] = clusterId;
            updateParams["deletion_protection_enabled"] = "false";
            
            auto updatedCluster = UpdateCluster(region, updateParams);
            
            std::cout << "Updated " << updatedCluster.GetArn() << std::endl;
        }
        catch (const std::exception& e) {
            std::cerr << "Error: " << e.what() << std::endl;
        }
    }
    Aws::ShutdownAPI(options);
    return 0;
}
#endif // STANDALONE_MODE
