#include <iostream>
#include "UpdateCluster.h"

using namespace Aws;
using namespace Aws::DSQL;
using namespace Aws::DSQL::Model;

Aws::DSQL::Model::ClusterStatus updateCluster(const Aws::String& clusterId, bool deletionProtection, Aws::DSQL::DSQLClient& client) {
    UpdateClusterRequest request;
    request.SetIdentifier(clusterId);
    request.SetDeletionProtectionEnabled(deletionProtection);
    UpdateClusterOutcome outcome = client.UpdateCluster(request);
    ClusterStatus status = ClusterStatus::NOT_SET;

    if (outcome.IsSuccess()) {
        const auto& cluster = outcome.GetResult();
        status = cluster.GetStatus();
    } else {
        std::cerr << "Update operation failed: " << outcome.GetError().GetMessage() << std::endl;
    }

    std::cout << "Cluster Status: " << ClusterStatusMapper::GetNameForClusterStatus(status) << std::endl;
    return status;
}