using System.Diagnostics;
using Amazon;
using Amazon.DSQL;
using Amazon.DSQL.Model;
using Amazon.Runtime.Credentials;

namespace DSQLExamples.DeleteMultiRegionClusters;

public class DeleteMultiRegionClusters
{
    /// <summary>
    /// Create a client. We will use this later for performing operations on the cluster.
    /// </summary>
    private static async Task<AmazonDSQLClient> CreateDSQLClient(RegionEndpoint region)
    {
        var awsCredentials = await DefaultAWSCredentialsIdentityResolver.GetCredentialsAsync();
        var clientConfig = new AmazonDSQLConfig
        {
            RegionEndpoint = region,
        };
        return new AmazonDSQLClient(awsCredentials, clientConfig);
    }

    /// <summary>
    /// Delete multi-region clusters.
    /// </summary>
    public static async Task Delete(
        RegionEndpoint region1,
        string clusterId1,
        RegionEndpoint region2,
        string clusterId2)
    {
        using var client1 = await CreateDSQLClient(region1);
        using var client2 = await CreateDSQLClient(region2);

        var deleteRequest1 = new DeleteClusterRequest
        {
            Identifier = clusterId1
        };

        var deleteResponse1 = await client1.DeleteClusterAsync(deleteRequest1);
        Console.WriteLine($"Initiated deletion of {deleteResponse1.Arn}");

        // cluster 1 will stay in PENDING_DELETE state until cluster 2 is deleted
        var deleteRequest2 = new DeleteClusterRequest
        {
            Identifier = clusterId2
        };

        var deleteResponse2 = await client2.DeleteClusterAsync(deleteRequest2);
        Console.WriteLine($"Initiated deletion of {deleteResponse2.Arn}");
    }

    public static async Task Main()
    {
        var region1Name = Environment.GetEnvironmentVariable("CLUSTER_1_REGION");
        Debug.Assert(!string.IsNullOrEmpty(region1Name), "Environment variable `CLUSTER_1_REGION` must be set");
        var region1 = RegionEndpoint.GetBySystemName(region1Name);

        var cluster1 = Environment.GetEnvironmentVariable("CLUSTER_1_ID");
        Debug.Assert(!string.IsNullOrEmpty(cluster1), "Environment variable `CLUSTER_1_ID` must be set");

        var region2Name = Environment.GetEnvironmentVariable("CLUSTER_2_REGION");
        Debug.Assert(!string.IsNullOrEmpty(region2Name), "Environment variable `CLUSTER_2_REGION` must be set");
        var region2 = RegionEndpoint.GetBySystemName(region2Name);

        var cluster2 = Environment.GetEnvironmentVariable("CLUSTER_2_ID");
        Debug.Assert(!string.IsNullOrEmpty(cluster2), "Environment variable `CLUSTER_2_ID` must be set");

        await Delete(region1, cluster1, region2, cluster2);
    }
}