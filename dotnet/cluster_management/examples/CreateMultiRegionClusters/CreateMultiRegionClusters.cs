using System.Diagnostics;
using Amazon;
using Amazon.DSQL;
using Amazon.DSQL.Model;
using Amazon.Runtime.Credentials;

namespace DSQLExamples.CreateMultiRegionClusters;

public class CreateMultiRegionClusters
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
    /// Create some example linked DSQL clusters.
    /// </summary>
    public static async Task<(CreateClusterResponse, CreateClusterResponse)> Create(
        RegionEndpoint region1,
        RegionEndpoint region2,
        RegionEndpoint witnessRegion)
    {
        using var client1 = await CreateDSQLClient(region1);
        using var client2 = await CreateDSQLClient(region2);

        var tags = new Dictionary<string, string>
        {
            { "Name", "csharp multi region cluster" },
            { "Repo", "aws-samples/aurora-dsql-samples" }
        };

        // We can only set the witness region for the first cluster
        var createClusterRequest1 = new CreateClusterRequest
        {
            DeletionProtectionEnabled = true,
            Tags = tags,
            MultiRegionProperties = new MultiRegionProperties
            {
                WitnessRegion = witnessRegion.SystemName
            }
        };

        var cluster1 = await client1.CreateClusterAsync(createClusterRequest1);
        Console.WriteLine($"Initiated creation of {cluster1.Arn}");

        // For the second cluster we can set witness region and designate cluster1 as a peer
        var createClusterRequest2 = new CreateClusterRequest
        {
            DeletionProtectionEnabled = true,
            Tags = tags,
            MultiRegionProperties = new MultiRegionProperties
            {
                WitnessRegion = witnessRegion.SystemName,
                Clusters = new List<string> { cluster1.Arn }
            }
        };

        var cluster2 = await client2.CreateClusterAsync(createClusterRequest2);
        Console.WriteLine($"Initiated creation of {cluster2.Arn}");

        // Now that we know the cluster2 arn we can set it as a peer of cluster1
        var updateClusterRequest = new UpdateClusterRequest
        {
            Identifier = cluster1.Identifier,
            MultiRegionProperties = new MultiRegionProperties
            {
                WitnessRegion = witnessRegion.SystemName,
                Clusters = new List<string> { cluster2.Arn }
            }
        };

        await client1.UpdateClusterAsync(updateClusterRequest);
        Console.WriteLine($"Added {cluster2.Arn} as a peer of {cluster1.Arn}");

        return (cluster1, cluster2);
    }

    public static async Task Main()
    {
        var region1Name = Environment.GetEnvironmentVariable("CLUSTER_1_REGION");
        Debug.Assert(!string.IsNullOrEmpty(region1Name), "Environment variable `CLUSTER_1_REGION` must be set");
        var region1 = RegionEndpoint.GetBySystemName(region1Name);

        var region2Name = Environment.GetEnvironmentVariable("CLUSTER_2_REGION");
        Debug.Assert(!string.IsNullOrEmpty(region2Name), "Environment variable `CLUSTER_2_REGION` must be set");
        var region2 = RegionEndpoint.GetBySystemName(region2Name);

        var witnessRegionName = Environment.GetEnvironmentVariable("WITNESS_REGION");
        Debug.Assert(!string.IsNullOrEmpty(witnessRegionName), "Environment variable `WITNESS_REGION` must be set");
        var witnessRegion = RegionEndpoint.GetBySystemName(witnessRegionName);

        var (cluster1, cluster2) = await Create(region1, region2, witnessRegion);

        Console.WriteLine("Created multi region clusters:");
        Console.WriteLine($"Cluster 1: {cluster1.Arn}");
        Console.WriteLine($"Cluster 2: {cluster2.Arn}");
    }
}