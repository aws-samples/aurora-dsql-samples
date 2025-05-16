#include <aws/core/Aws.h>

std::pair<Aws::DSQL::Model::CreateClusterResult, Aws::DSQL::Model::CreateClusterResult> CreateMultiRegionClusters(
    const Aws::String& region1,
    const Aws::String& region2,
    const Aws::String& witnessRegion);
