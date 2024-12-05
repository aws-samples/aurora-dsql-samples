#include "CreateSingleRegion.h"

using namespace Aws;
using namespace Aws::DSQL;
using namespace Aws::DSQL::Model;

Aws::String createCluster(Aws::DSQL::DSQLClient& client, bool deletionProtectionEnabled, const std::map<Aws::String, Aws::String>& tags) {
    CreateClusterRequest request;
    request.SetDeletionProtectionEnabled(deletionProtectionEnabled);
    request.SetTags(tags);
    CreateClusterOutcome outcome = client.CreateCluster(request);

    const auto& clusterResult = outcome.GetResult().GetIdentifier();
    if (outcome.IsSuccess()) {
        std::cout << "Cluster Identifier: " << clusterResult << std::endl;
    } else {
        std::cerr << "Create operation failed: " << outcome.GetError().GetMessage() << std::endl;
    }
    return clusterResult;
}