using System.Diagnostics;
using Amazon;
using Amazon.DSQL;
using Amazon.DSQL.Model;
using Amazon.Runtime.Credentials;

namespace DSQLExamples.CreateSingleRegionCluster;

public class CreateSingleRegionCluster
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
    /// Create an example DSQL cluster.
    /// </summary>
    public static async Task<CreateClusterResponse> Create(RegionEndpoint region)
    {
        using var client = await CreateDSQLClient(region);

        var repo = Environment.GetEnvironmentVariable("GITHUB_REPOSITORY") ?? "local";
        var runId = Environment.GetEnvironmentVariable("GITHUB_RUN_ID") ?? "local";

        var createClusterRequest = new CreateClusterRequest
        {
            DeletionProtectionEnabled = true,
            Tags = new Dictionary<string, string>
            {
                { "Name", "csharp single region cluster" },
                { "Repo", repo },
                { "Type", "cluster-management" },
                { "RunId", runId }
            }
        };

        CreateClusterResponse response = await client.CreateClusterAsync(createClusterRequest);
        Console.WriteLine($"Initiated creation of {response.Arn}");

        return response;
    }

    public static async Task Main()
    {
        var regionName = Environment.GetEnvironmentVariable("CLUSTER_REGION");
        Debug.Assert(!string.IsNullOrEmpty(regionName), "Environment variable `CLUSTER_REGION` must be set");
        var region = RegionEndpoint.GetBySystemName(regionName);

        await Create(region);
    }
}