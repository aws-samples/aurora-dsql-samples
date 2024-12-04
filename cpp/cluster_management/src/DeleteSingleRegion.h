#include <aws/core/Aws.h>
#include <aws/dsql/DSQLClient.h>
#include <aws/dsql/model/DeleteClusterRequest.h>

Aws::DSQL::Model::ClusterStatus deleteCluster(const Aws::String& clusterId, Aws::DSQL::DSQLClient& client);
