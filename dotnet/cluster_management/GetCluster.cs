using Amazon;
using Amazon.DSQL;
using Amazon.DSQL.Model;
using Amazon.Runtime;

class GetCluster {
    public static async Task<GetClusterResponse> Get(RegionEndpoint region, string clusterId)
    {
        // Create the sdk client
        AWSCredentials aWSCredentials = FallbackCredentialsFactory.GetCredentials();
        AmazonDSQLConfig clientConfig = new()
        {
            AuthenticationServiceName = "dsql",
            RegionEndpoint = region
        };
        AmazonDSQLClient client = new(aWSCredentials, clientConfig);

        // Get cluster details
        GetClusterRequest getClusterRequest = new()
        {
            Identifier = clusterId
        };

        // Assert that operation is successful
        GetClusterResponse getClusterResponse = await client.GetClusterAsync(getClusterRequest);
        Console.WriteLine(getClusterResponse.Status);
        
        return getClusterResponse;
    }
}

