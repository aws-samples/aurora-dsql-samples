using Amazon.DSQL;
using Amazon;
using Amazon.DSQL.Model;
using Amazon.Runtime;


#region Create

RegionEndpoint region = RegionEndpoint.USEast1;
AWSCredentials aWSCredentials = FallbackCredentialsFactory.GetCredentials();
AmazonDSQLConfig clientConfig = new()
{
    ServiceURL = "https://dsql.us-east-1.api.aws",
    AuthenticationServiceName = "dsql",
    RegionEndpoint = region

};
AmazonDSQLClient client = new(aWSCredentials, clientConfig);

CreateClusterRequest createClusterRequest = new()
{
    DeletionProtectionEnabled = true
};

CreateClusterResponse createClusterResponse = await client.CreateClusterAsync(createClusterRequest);

Console.WriteLine(createClusterResponse.Identifier);
Console.WriteLine(createClusterResponse.Status);

#endregion

#region Read

string clusterId = createClusterResponse.Identifier;
GetClusterRequest getClusterRequest = new()
{
    Identifier = clusterId
};

GetClusterResponse getClusterResponse = await client.GetClusterAsync(getClusterRequest);
Console.WriteLine(getClusterResponse.Status);

ListClustersRequest listClustersRequest = new();
ListClustersResponse listClustersResponse = await client.ListClustersAsync(listClustersRequest);

Console.WriteLine(IEnumerableToString(listClustersResponse.Clusters.Select(x => x.Identifier)));

#endregion

#region Update

UpdateClusterRequest updateClusterRequest = new UpdateClusterRequest()
{
    Identifier = clusterId,
    DeletionProtectionEnabled = false
};

await client.UpdateClusterAsync(updateClusterRequest);

#endregion

#region Delete

DeleteClusterRequest deleteClusterRequest = new()
{
    Identifier = clusterId
};
DeleteClusterResponse deleteClusterResponse = await client.DeleteClusterAsync(deleteClusterRequest);
Console.WriteLine(deleteClusterResponse.Status);

#endregion

#region Multi Region Cluster


LinkedClusterProperties linkedClusterPropertiesEast1 = new()
{
    DeletionProtectionEnabled = false,
    Tags = { { "Name", "use1-example-cluster" }, { "Usecase", "testing-mr-use1" } }
};

LinkedClusterProperties linkedClusterPropertiesEast2 = new()
{
    DeletionProtectionEnabled = false,
    Tags = { { "Name", "use2-example-cluster" }, { "Usecase", "testing-mr-use2" } }
};

const string witnessRegion = "us-west-2";
CreateMultiRegionClustersRequest createMultiRegionClustersRequest = new()
{
    LinkedRegionList = [region.SystemName, "us-east-2"],
    WitnessRegion = witnessRegion,
    ClusterProperties = { { "us-east-1", linkedClusterPropertiesEast1 }, { "us-east-2", linkedClusterPropertiesEast2 } }
};

CreateMultiRegionClustersResponse createMultiRegionClustersResponse = await client.CreateMultiRegionClustersAsync(createMultiRegionClustersRequest);
Console.WriteLine(IEnumerableToString(createMultiRegionClustersResponse.LinkedClusterArns));

DeleteMultiRegionClustersRequest deleteMultiRegionClustersRequest = new()
{
    LinkedClusterArns = createMultiRegionClustersResponse.LinkedClusterArns
};

DeleteMultiRegionClustersResponse deleteMultiRegionClustersResponse = await client.DeleteMultiRegionClustersAsync(deleteMultiRegionClustersRequest);
Console.WriteLine(deleteMultiRegionClustersResponse.ResponseMetadata.RequestId);

#endregion

static string IEnumerableToString(IEnumerable<string> strings)
{
    return ("[" + string.Join(", ", strings))[..^2] + "]";
}