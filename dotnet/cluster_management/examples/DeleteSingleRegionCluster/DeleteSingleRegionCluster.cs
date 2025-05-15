using System.Diagnostics;
using Amazon;
using Amazon.DSQL;
using Amazon.DSQL.Model;
using Amazon.Runtime.Credentials;

namespace DSQLExamples.DeleteSingleRegionCluster;

public class DeleteSingleRegionCluster
{
    /// <summary>
    /// Create a client. We will use this later for performing operations on the cluster.
    /// </summary>
    private static async Task<AmazonDSQLClient> CreateDSQLClient(RegionEndpoint region)
    {
        var awsCredentials = await DefaultAWSCredentialsIdentityResolver.GetCredentialsAsync();
        var clientConfig = new AmazonDSQLConfig
        {
            RegionEndpoint = region
        };
        return new AmazonDSQLClient(awsCredentials, clientConfig);
    }

    /// <summary>
    /// Delete a DSQL cluster.
    /// </summary>
    public static async Task Delete(RegionEndpoint region, string identifier)
    {
        using var client = await CreateDSQLClient(region);

        var deleteRequest = new DeleteClusterRequest
        {
            Identifier = identifier
        };

        var deleteResponse = await client.DeleteClusterAsync(deleteRequest);
        Console.WriteLine($"Initiated deletion of {deleteResponse.Arn}");
    }

    public static async Task Main()
    {
        var regionName = Environment.GetEnvironmentVariable("CLUSTER_REGION");
        Debug.Assert(!string.IsNullOrEmpty(regionName), "Environment variable `CLUSTER_REGION` must be set");
        var region = RegionEndpoint.GetBySystemName(regionName);

        var clusterId = Environment.GetEnvironmentVariable("CLUSTER_ID");
        Debug.Assert(!string.IsNullOrEmpty(clusterId), "Environment variable `CLUSTER_ID` must be set");

        await Delete(region, clusterId);
    }
}