// .NET SDK examples for generating Aurora DSQL authentication tokens

// --8<-- [start:dotnet-generate-token]
using Amazon;
using Amazon.DSQL.Util;

var yourClusterEndpoint = "insert-dsql-cluster-endpoint";

// Use `DSQLAuthTokenGenerator.GenerateDbConnectAuthToken` if you are _not_ logging in as `admin` user
var token = DSQLAuthTokenGenerator.GenerateDbConnectAdminAuthToken(RegionEndpoint.USEast1, yourClusterEndpoint);

Console.WriteLine(token);
// --8<-- [end:dotnet-generate-token]