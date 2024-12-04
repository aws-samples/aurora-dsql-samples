using Amazon;
using Amazon.DSQL;
using Amazon.DSQL.Model;
using Amazon.Runtime;

class MultiRegionClusterDeletion {
    public static async Task Delete(RegionEndpoint region, List<string> arns)
    {
        // Create the sdk client
        AWSCredentials aWSCredentials = FallbackCredentialsFactory.GetCredentials();
        AmazonDSQLConfig clientConfig = new()
        {
            AuthenticationServiceName = "dsql",
            RegionEndpoint = region
        };
        AmazonDSQLClient client = new(aWSCredentials, clientConfig);

        // Delete a multi region clusters
        DeleteMultiRegionClustersRequest deleteMultiRegionClustersRequest = new()
        {
            LinkedClusterArns = arns
        };
        DeleteMultiRegionClustersResponse deleteMultiRegionClustersResponse = 
            await client.DeleteMultiRegionClustersAsync(deleteMultiRegionClustersRequest);
        Console.WriteLine(deleteMultiRegionClustersResponse.ResponseMetadata.RequestId);
    }
}
