// .NET SDK examples for generating Aurora DSQL authentication tokens

// --8<-- [start:dotnet-generate-token]
using Amazon;
using Amazon.DSQL.Util;
using Amazon.Runtime;

var yourClusterEndpoint = "insert-dsql-cluster-endpoint";

AWSCredentials credentials = FallbackCredentialsFactory.GetCredentials();

// Use `DSQLAuthTokenGenerator.GenerateDbConnectAuthToken` if you are _not_ logging in as `admin` user
var token = DSQLAuthTokenGenerator.GenerateDbConnectAdminAuthToken(credentials, RegionEndpoint.USEast1, yourClusterEndpoint);

Console.WriteLine(token);
// --8<-- [end:dotnet-generate-token]