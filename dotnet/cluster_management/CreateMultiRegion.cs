using Amazon;
using Amazon.DSQL;
using Amazon.DSQL.Model;
using Amazon.Runtime;

class MultiRegionClusterCreation {
    public static async Task<CreateMultiRegionClustersResponse> Create(RegionEndpoint region)
    {
        // Create the sdk client
        AWSCredentials aWSCredentials = FallbackCredentialsFactory.GetCredentials();
        AmazonDSQLConfig clientConfig = new()
        {
            AuthenticationServiceName = "dsql",
            RegionEndpoint = region
        };
        AmazonDSQLClient client = new(aWSCredentials, clientConfig);


        // Create multi region cluster
        LinkedClusterProperties USEast1Props = new() {
            DeletionProtectionEnabled = false,
            Tags = new Dictionary<string, string>
            {
                { "Name", "use1-example-cluster" },
                { "Usecase", "testing-mr-use1" }
            }
        };

        LinkedClusterProperties USEast2Props = new() {
            DeletionProtectionEnabled = false,
            Tags = new Dictionary<string, string>
            {
                { "Name", "use2-example-cluster" },
                { "Usecase", "testing-mr-use2" }
            }
        };

        CreateMultiRegionClustersRequest createMultiRegionClustersRequest = new()
        {
            LinkedRegionList = new List<string> { "us-east-1", "us-east-2" },
            WitnessRegion = "us-west-2",
            ClusterProperties = new Dictionary<string, LinkedClusterProperties>
            {
                { "us-east-1", USEast1Props },
                { "us-east-2", USEast2Props }
            }
        };

        CreateMultiRegionClustersResponse createMultiRegionClustersResponse = 
            await client.CreateMultiRegionClustersAsync(createMultiRegionClustersRequest);

        foreach (string arn in createMultiRegionClustersResponse.LinkedClusterArns) {
            Console.WriteLine(arn);
        }

        return createMultiRegionClustersResponse;
    }
}

