#include <iostream>
#include <vector>
#include <map>
#include "CreateMultiRegion.h"

using namespace Aws;
using namespace Aws::DSQL;
using namespace Aws::DSQL::Model;

std::vector<Aws::String> createMultiRegionCluster(Aws::DSQL::DSQLClient& client, const std::vector<Aws::String>& linkedRegionList, const Aws::String& witnessRegion, const Aws::Map<Aws::String, LinkedClusterProperties>& clusterProperties) {
    CreateMultiRegionClustersRequest request;
    request.SetLinkedRegionList(linkedRegionList);
    request.SetWitnessRegion(witnessRegion);
    request.SetClusterProperties(clusterProperties);

    CreateMultiRegionClustersOutcome outcome = client.CreateMultiRegionClusters(request);

    if (outcome.IsSuccess()) {
        const auto& clusterArns = outcome.GetResult().GetLinkedClusterArns();
        return clusterArns;
    } else {
        std::cerr << "Create operation failed: " << outcome.GetError().GetMessage() << std::endl;
        return {};
    }
}