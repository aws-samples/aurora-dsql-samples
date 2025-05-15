using Amazon;
using Amazon.DSQL;
using Amazon.DSQL.Model;
using Amazon.Runtime.Credentials;
using Xunit;
using Xunit.Abstractions;
using static DSQLExamples.CreateMultiRegionClusters.CreateMultiRegionClusters;
using static DSQLExamples.CreateSingleRegionCluster.CreateSingleRegionCluster;
using static DSQLExamples.DeleteMultiRegionClusters.DeleteMultiRegionClusters;
using static DSQLExamples.DeleteSingleRegionCluster.DeleteSingleRegionCluster;
using static DSQLExamples.GetCluster.GetCluster;
using static DSQLExamples.UpdateCluster.UpdateCluster;

namespace DSQLExamples.Tests;

public class ExamplesTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan PollingInterval = TimeSpan.FromSeconds(15);

    private readonly ITestOutputHelper _testOutputHelper;

    public ExamplesTests(ITestOutputHelper testOutputHelper)
    {
        _testOutputHelper = testOutputHelper;
    }

    private static async Task<AmazonDSQLClient> CreateDSQLClient(RegionEndpoint region)
    {
        var awsCredentials = await DefaultAWSCredentialsIdentityResolver.GetCredentialsAsync();
        var clientConfig = new AmazonDSQLConfig
        {
            RegionEndpoint = region
        };
        return new AmazonDSQLClient(awsCredentials, clientConfig);
    }

    private async Task WaitForClusterActive(RegionEndpoint region, string clusterId)
    {
        using var client = await CreateDSQLClient(region);
        var request = new GetClusterRequest { Identifier = clusterId };

        var startTime = DateTime.UtcNow;
        var endTime = startTime.Add(Timeout);

        while (DateTime.UtcNow < endTime)
        {
            var response = await client.GetClusterAsync(request);
            var currentStatus = response.Status;

            _testOutputHelper.WriteLine($"Cluster {clusterId} current status: {currentStatus}");

            if (currentStatus == ClusterStatus.ACTIVE)
            {
                _testOutputHelper.WriteLine($"Cluster {clusterId} reached ACTIVE");
                return;
            }

            await Task.Delay(PollingInterval);
        }

        throw new TimeoutException($"Timed out waiting for cluster {clusterId} to become ACTIVE");
    }

    private async Task WaitForClusterNotExist(RegionEndpoint region, string clusterId)
    {
        using var client = await CreateDSQLClient(region);
        var request = new GetClusterRequest { Identifier = clusterId };

        var startTime = DateTime.UtcNow;
        var endTime = startTime.Add(Timeout);

        while (DateTime.UtcNow < endTime)
        {
            try
            {
                var response = await client.GetClusterAsync(request);
                var currentStatus = response.Status;

                _testOutputHelper.WriteLine($"Cluster {clusterId} current status: {currentStatus}");
            }
            catch (ResourceNotFoundException)
            {
                _testOutputHelper.WriteLine($"Cluster {clusterId} no longer exists");
                return;
            }

            await Task.Delay(PollingInterval);
        }

        throw new TimeoutException($"Timed out waiting for cluster {clusterId} to be deleted");
    }

    [Fact]
    public async Task TestSingleRegionClusterLifecycle()
    {
        var regionName = Environment.GetEnvironmentVariable("CLUSTER_REGION") ?? "us-east-1";
        var region = RegionEndpoint.GetBySystemName(regionName);

        _testOutputHelper.WriteLine("Creating single region cluster...");
        var output = await Create(region);
        var clusterId = output.Identifier;

        await WaitForClusterActive(region, clusterId);

        _testOutputHelper.WriteLine("Getting cluster details...");
        var cluster = await Get(region, clusterId);
        Assert.Equal(clusterId, cluster.Identifier);

        _testOutputHelper.WriteLine("Updating cluster to remove deletion protection...");
        var updateResponse = await Update(region, clusterId);
        Assert.Equal(clusterId, updateResponse.Identifier);

        _testOutputHelper.WriteLine("Deleting cluster...");
        await Delete(region, clusterId);

        await WaitForClusterNotExist(region, clusterId);

        _testOutputHelper.WriteLine("Single region cluster test completed successfully");
    }

    [Fact]
    public async Task TestMultiRegionClusterLifecycle()
    {
        var region1Name = Environment.GetEnvironmentVariable("CLUSTER_1_REGION") ?? "us-east-1";
        var region2Name = Environment.GetEnvironmentVariable("CLUSTER_2_REGION") ?? "us-east-2";
        var witnessRegionName = Environment.GetEnvironmentVariable("WITNESS_REGION") ?? "us-west-2";

        var region1 = RegionEndpoint.GetBySystemName(region1Name);
        var region2 = RegionEndpoint.GetBySystemName(region2Name);
        var witnessRegion = RegionEndpoint.GetBySystemName(witnessRegionName);

        _testOutputHelper.WriteLine("Creating multi-region clusters...");
        var (cluster1, cluster2) = await Create(region1, region2, witnessRegion);

        var cluster1Id = cluster1.Identifier;
        var cluster2Id = cluster2.Identifier;

        await WaitForClusterActive(region1, cluster1Id);
        await WaitForClusterActive(region2, cluster2Id);

        _testOutputHelper.WriteLine("Getting cluster details...");
        var cluster1Details = await Get(region1, cluster1Id);
        var cluster2Details = await Get(region2, cluster2Id);

        var cluster1MultiRegionProps = cluster1Details.MultiRegionProperties;
        Assert.NotNull(cluster1MultiRegionProps);

        var cluster1LinkedClusters = cluster1MultiRegionProps.Clusters;
        Assert.NotNull(cluster1LinkedClusters);
        Assert.Contains(cluster2Details.Arn, cluster1LinkedClusters);

        var cluster1WitnessRegion = cluster1MultiRegionProps.WitnessRegion;
        Assert.NotNull(cluster1WitnessRegion);
        Assert.Equal(witnessRegionName, cluster1WitnessRegion);

        var cluster2MultiRegionProps = cluster2Details.MultiRegionProperties;
        Assert.NotNull(cluster2MultiRegionProps);

        var cluster2LinkedClusters = cluster2MultiRegionProps.Clusters;
        Assert.NotNull(cluster2LinkedClusters);
        Assert.Contains(cluster1Details.Arn, cluster2LinkedClusters);

        var cluster2WitnessRegion = cluster2MultiRegionProps.WitnessRegion;
        Assert.NotNull(cluster2WitnessRegion);
        Assert.Equal(witnessRegionName, cluster2WitnessRegion);

        _testOutputHelper.WriteLine("Updating clusters to remove deletion protection...");
        var update1Response = await Update(region1, cluster1Id);
        Assert.Equal(cluster1Id, update1Response.Identifier);
        var update2Response = await Update(region2, cluster2Id);
        Assert.Equal(cluster2Id, update2Response.Identifier);

        _testOutputHelper.WriteLine("Deleting clusters...");
        await Delete(region1, cluster1Id, region2, cluster2Id);

        await WaitForClusterNotExist(region1, cluster1Id);
        await WaitForClusterNotExist(region2, cluster2Id);

        _testOutputHelper.WriteLine("Multi-region cluster test completed successfully");
    }
}