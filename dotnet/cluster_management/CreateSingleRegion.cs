using Amazon;
using Amazon.DSQL;
using Amazon.DSQL.Model;
using Amazon.Runtime;

class SingleRegionClusterCreation {
    public static async Task<CreateClusterResponse> Create(RegionEndpoint region)
    {
        // Create the sdk client
        AWSCredentials aWSCredentials = FallbackCredentialsFactory.GetCredentials();
        AmazonDSQLConfig clientConfig = new()
        {
            AuthenticationServiceName = "dsql",
            RegionEndpoint = region
        };
        AmazonDSQLClient client = new(aWSCredentials, clientConfig);

        // Create a single region cluster
        CreateClusterRequest createClusterRequest = new()
        {
            DeletionProtectionEnabled = true
        };

        CreateClusterResponse createClusterResponse = await client.CreateClusterAsync(createClusterRequest);

        Console.WriteLine(createClusterResponse.Identifier);
        Console.WriteLine(createClusterResponse.Status);

        return createClusterResponse;
    }
}


