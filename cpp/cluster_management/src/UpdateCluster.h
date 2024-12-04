#include <aws/core/Aws.h>
#include <aws/dsql/DSQLClient.h>
#include <aws/dsql/model/UpdateClusterRequest.h>

Aws::DSQL::Model::ClusterStatus updateCluster(const Aws::String& clusterId, bool deletionProtection, Aws::DSQL::DSQLClient& client);

