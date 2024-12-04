#include <aws/core/Aws.h>
#include <aws/dsql/DSQLClient.h>
#include <aws/dsql/model/CreateMultiRegionClustersRequest.h>
#include <aws/dsql/model/LinkedClusterProperties.h>

std::vector<Aws::String> createMultiRegionCluster(Aws::DSQL::DSQLClient& client, const std::vector<Aws::String>& linkedRegionList, const Aws::String& witnessRegion, const Aws::Map<Aws::String, Aws::DSQL::Model::LinkedClusterProperties>& clusterProperties);
