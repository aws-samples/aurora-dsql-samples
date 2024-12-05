#include <iostream>
#include <vector>
#include "DeleteMultiRegion.h"

using namespace Aws;
using namespace Aws::DSQL;
using namespace Aws::DSQL::Model;

std::vector<Aws::String> deleteMultiRegionClusters(const std::vector<Aws::String>& linkedClusterArns, DSQLClient& client) {
    DeleteMultiRegionClustersRequest request;
    request.SetLinkedClusterArns(linkedClusterArns);

    DeleteMultiRegionClustersOutcome outcome = client.DeleteMultiRegionClusters(request);

    if (outcome.IsSuccess()) {
        std::cout << "Successfully deleted clusters." << std::endl;
        return linkedClusterArns;
    } else {
        std::cerr << "Delete operation failed: " << outcome.GetError().GetMessage() << std::endl;
        return {};
    }
}