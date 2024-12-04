#include <iostream>
#include "DeleteSingleRegion.h"

using namespace Aws;
using namespace Aws::DSQL;
using namespace Aws::DSQL::Model;

Aws::DSQL::Model::ClusterStatus deleteCluster(const Aws::String& clusterId, Aws::DSQL::DSQLClient& client) {
    DeleteClusterRequest request;
    request.SetIdentifier(clusterId);

    DeleteClusterOutcome outcome = client.DeleteCluster(request);
    ClusterStatus status = ClusterStatus::NOT_SET;

    if (outcome.IsSuccess()) {
        const auto& cluster = outcome.GetResult();
        status = cluster.GetStatus();
    } else {
        std::cerr << "Delete operation failed: " << outcome.GetError().GetMessage() << std::endl;
    }
    std::cout << "Cluster Status: " << ClusterStatusMapper::GetNameForClusterStatus(status) << std::endl;
    return status;
}

