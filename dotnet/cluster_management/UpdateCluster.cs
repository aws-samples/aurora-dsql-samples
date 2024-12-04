using Amazon;
using Amazon.DSQL;
using Amazon.DSQL.Model;
using Amazon.Runtime;

class UpdateCluster {
    public static async Task Update(RegionEndpoint region, string clusterId)
    {
        // Create the sdk client
        AWSCredentials aWSCredentials = FallbackCredentialsFactory.GetCredentials();
        AmazonDSQLConfig clientConfig = new()
        {
            AuthenticationServiceName = "dsql",
            RegionEndpoint = region
        };
        AmazonDSQLClient client = new(aWSCredentials, clientConfig);

        // Update cluster details by setting delete protection to false
        UpdateClusterRequest updateClusterRequest = new UpdateClusterRequest()
        {
            Identifier = clusterId,
            DeletionProtectionEnabled = false
        };

        await client.UpdateClusterAsync(updateClusterRequest);
    }
}

