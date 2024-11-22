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
Console.WriteLine(listClustersResponse.Clusters);

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