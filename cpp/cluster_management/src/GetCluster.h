#include <aws/core/Aws.h>
#include <aws/dsql/DSQLClient.h>
#include <aws/dsql/model/GetClusterRequest.h>
#include <aws/dsql/model/ClusterStatus.h>

Aws::DSQL::Model::ClusterStatus getCluster(const Aws::String& clusterId, Aws::DSQL::DSQLClient& client);

