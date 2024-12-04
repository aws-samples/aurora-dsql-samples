
#include <aws/core/Aws.h>
#include <aws/dsql/DSQLClient.h>
#include <aws/dsql/model/CreateClusterRequest.h>

Aws::String createCluster(Aws::DSQL::DSQLClient& client, bool deletionProtectionEnabled, const std::map<Aws::String, Aws::String>& tags);
