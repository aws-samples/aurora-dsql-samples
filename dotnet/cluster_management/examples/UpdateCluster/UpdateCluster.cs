using System.Diagnostics;
using Amazon;
using Amazon.DSQL;
using Amazon.DSQL.Model;
using Amazon.Runtime.Credentials;

namespace DSQLExamples.UpdateCluster;

public class UpdateCluster
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
    /// Update a DSQL cluster and set delete protection to false.
    /// </summary>
    public static async Task<UpdateClusterResponse> Update(RegionEndpoint region, string identifier)
    {
        using var client = await CreateDSQLClient(region);

        var updateClusterRequest = new UpdateClusterRequest
        {
            Identifier = identifier,
            DeletionProtectionEnabled = false
        };

        UpdateClusterResponse response = await client.UpdateClusterAsync(updateClusterRequest);
        Console.WriteLine($"Updated {response.Arn}");

        return response;
    }

    public static async Task Main()
    {
        var regionName = Environment.GetEnvironmentVariable("CLUSTER_REGION");
        Debug.Assert(!string.IsNullOrEmpty(regionName), "Environment variable `CLUSTER_REGION` must be set");
        var region = RegionEndpoint.GetBySystemName(regionName);

        var clusterId = Environment.GetEnvironmentVariable("CLUSTER_ID");
        Debug.Assert(!string.IsNullOrEmpty(clusterId), "Environment variable `CLUSTER_ID` must be set");

        await Update(region, clusterId);
    }
}