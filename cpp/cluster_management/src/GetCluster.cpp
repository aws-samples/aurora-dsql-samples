#include "GetCluster.h"

using namespace Aws;
using namespace Aws::DSQL;
using namespace Aws::DSQL::Model;

ClusterStatus getCluster(const Aws::String& clusterId, Aws::DSQL::DSQLClient& client) {
    GetClusterRequest request;
    request.SetIdentifier(clusterId);
    GetClusterOutcome outcome = client.GetCluster(request);
    ClusterStatus status = ClusterStatus::NOT_SET;

    if (outcome.IsSuccess()) {
        const auto& cluster = outcome.GetResult();
        status = cluster.GetStatus();
    } else {
        std::cerr << "Get operation failed: " << outcome.GetError().GetMessage() << std::endl;
    }
    std::cout << "Cluster Status: " << ClusterStatusMapper::GetNameForClusterStatus(status) << std::endl;
    return status;
}

