using Amazon;
using Amazon.DSQL;
using Amazon.DSQL.Model;
using Amazon.Runtime;

class SingleRegionClusterDeletion {
    public static async Task<DeleteClusterResponse> Delete(RegionEndpoint region, string clusterId)
    {
        // Create the sdk client
        AWSCredentials aWSCredentials = FallbackCredentialsFactory.GetCredentials();
        AmazonDSQLConfig clientConfig = new()
        {
            AuthenticationServiceName = "dsql",
            RegionEndpoint = region
        };
        AmazonDSQLClient client = new(aWSCredentials, clientConfig);

        // Delete a single region cluster
        DeleteClusterRequest deleteClusterRequest = new()
        {
            Identifier = clusterId
        };
        DeleteClusterResponse deleteClusterResponse = await client.DeleteClusterAsync(deleteClusterRequest);
        Console.WriteLine(deleteClusterResponse.Status);

        return deleteClusterResponse;        
    }
}
