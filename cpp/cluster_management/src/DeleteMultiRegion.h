#include <aws/core/Aws.h>
#include <aws/dsql/DSQLClient.h>
#include <aws/dsql/model/DeleteMultiRegionClustersRequest.h>

std::vector<Aws::String> deleteMultiRegionClusters(const std::vector<Aws::String>& linkedClusterArns, Aws::DSQL::DSQLClient& client);