using System.Diagnostics;
using Amazon;
using Amazon.DSQL;
using Amazon.DSQL.Model;
using Amazon.Runtime.Credentials;

namespace DSQLExamples.GetCluster;

public class GetCluster
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
    /// Get information about a DSQL cluster.
    /// </summary>
    public static async Task<GetClusterResponse> Get(RegionEndpoint region, string identifier)
    {
        using var client = await CreateDSQLClient(region);

        var getClusterRequest = new GetClusterRequest
        {
            Identifier = identifier
        };

        return await client.GetClusterAsync(getClusterRequest);
    }

    public static async Task Main()
    {
        var regionName = Environment.GetEnvironmentVariable("CLUSTER_REGION");
        Debug.Assert(!string.IsNullOrEmpty(regionName), "Environment variable `CLUSTER_REGION` must be set");
        var region = RegionEndpoint.GetBySystemName(regionName);

        var clusterId = Environment.GetEnvironmentVariable("CLUSTER_ID");
        Debug.Assert(!string.IsNullOrEmpty(clusterId), "Environment variable `CLUSTER_ID` must be set");

        var response = await Get(region, clusterId);
        Console.WriteLine($"Cluster ARN: {response.Arn}");
    }
}