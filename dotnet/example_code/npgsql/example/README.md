# .NET with Aurora DSQL

## Table of Contents

1. Prerequisites
2. Execute Examples
   1. SQL CRUD Examples
      1. Create
      2. Read
      3. Update
      4. Delete

## Prerequisites

1. Provision a Aurora DSQL cluster by following the [user guide](TBD) if not already done.
   Note down the endpoint, you will need to establish a connection.

2. dotnet: Ensure you have dotnet 8+ installed. You can download it from the [official website](https://learn.microsoft.com/en-us/dotnet/core/install/).

   _To verify the dotnet is installed, you can run_
   ```bash
   dotnet --version
   ```

   It should output something similar to `8.0.403`. (you version could be different)

### Obtaining the .NET Npgsql Driver for PostgreSQL

#### Direct Download
The .NET Npgsql Driver can be installed from the [official website](https://www.nuget.org/packages/Npgsql/8.0.5).

### Connect to Cluster

Via .NET

Define `TokenGenerator` class.
```csharp
using Amazon.Runtime;
using Amazon.Runtime.Internal;
using Amazon.Runtime.Internal.Auth;
using Amazon.Runtime.Internal.Util;

namespace Example
{
    public static class TokenGenerator
    {
        public static string GenerateAuthToken(string? hostname, Amazon.RegionEndpoint region)
        {
            AWSCredentials awsCredentials = FallbackCredentialsFactory.GetCredentials();

            string accessKey = awsCredentials.GetCredentials().AccessKey;
            string secretKey = awsCredentials.GetCredentials().SecretKey;
            string token = awsCredentials.GetCredentials().Token;

            const string XanaduServiceName = "xanadu";
            const string HTTPGet = "GET";
            const string HTTPS = "https";
            const string URISchemeDelimiter = "://";
            const string ActionKey = "Action";
            const string ActionValue = "DbConnectSuperuser";
            const string XAmzSecurityToken = "X-Amz-Security-Token";

            ImmutableCredentials immutableCredentials = new ImmutableCredentials(accessKey, secretKey, token) ?? throw new ArgumentNullException("immutableCredentials");
            ArgumentNullException.ThrowIfNull(region);

            hostname = hostname?.Trim();
            if (string.IsNullOrEmpty(hostname))
                throw new ArgumentException("Hostname must not be null or empty.");

            GenerateDsqlAuthTokenRequest authTokenRequest = new GenerateDsqlAuthTokenRequest();
            IRequest request = new DefaultRequest(authTokenRequest, XanaduServiceName)
            {
                UseQueryString = true,
                HttpMethod = HTTPGet
            };
            request.Parameters.Add(ActionKey, ActionValue);
            request.Endpoint = new UriBuilder(HTTPS, hostname).Uri;

            if (immutableCredentials.UseToken)
            {
                request.Parameters[XAmzSecurityToken] = immutableCredentials.Token;
            }

            var signingResult = AWS4PreSignedUrlSigner.SignRequest(request, null, new RequestMetrics(), immutableCredentials.AccessKey,
                immutableCredentials.SecretKey, XanaduServiceName, region.SystemName);

            var authorization = "&" + signingResult.ForQueryParameters;
            var url = AmazonServiceClient.ComposeUrl(request);

            // remove the https:// and append the authorization
            return url.AbsoluteUri[(HTTPS.Length + URISchemeDelimiter.Length)..] + authorization;
        }

        private class GenerateDsqlAuthTokenRequest : AmazonWebServiceRequest
        {
            public GenerateDsqlAuthTokenRequest()
            {
                ((IAmazonWebServiceRequest)this).SignatureVersion = SignatureVersion.SigV4;
            }
        }
    }
}
```

Connect to DSQL cluster.

```csharp
    public static class ConnectionUtil
    {
        public static async Task<NpgsqlConnection> GetConnection(string cluster, RegionEndpoint region)
        {
            const string username = "axdb_superuser";
            // The token expiration time is optional, and the default value 900 seconds
            string password = TokenGenerator.GenerateAuthToken(cluster, region);
            const string database = "postgres";
            var connString = "Host=" + cluster + ";Username=" + username + ";Password=" + password + ";Database=" + database + ";Port=" + 5432 + ";SSLMode=Require;";

            var conn = new NpgsqlConnection(connString);
            await conn.OpenAsync();
            return conn;
        }
    }

await using var conn = new NpgsqlConnection(connString);
```

## SQL CRUD Examples

> [!Important]
>
> To execute the example code, you need to have valid AWS Credentials configured (e.g. AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN)

### 1. Create Owner Table

> **Note**
>
> Note that Aurora DSQL does not support SERIAL, so id is based on uuid (suggest best practice guide on this TBD: Update link)

```csharp
void CreateTable(NpgsqlConnection conn) 
{
    using var cmd = new NpgsqlCommand("CREATE TABLE IF NOT EXISTS owner (id UUID PRIMARY KEY, name VARCHAR(30) NOT NULL, city VARCHAR(80) NOT NULL, telephone VARCHAR(20))", conn);
    cmd.ExecuteNonQuery();
}
```

### 2. Create Owner

```csharp
void CreateOwner(NpgsqlConnection conn)
{
    using var cmd = new NpgsqlCommand("INSERT INTO owner(id, name, city, telephone) VALUES(@id, @name, @city, @telephone)", conn);
    cmd.Parameters.AddWithValue("id", Guid.NewGuid());
    cmd.Parameters.AddWithValue("name", "John Doe");
    cmd.Parameters.AddWithValue("city", "Las Vegas");
    cmd.Parameters.AddWithValue("telephone", "555-555-5555");
    cmd.ExecuteNonQuery();
}
```

### 3. Read Owner
``` csharp
void ReadOwner(NpgsqlConnection conn)
{
    using var cmd = new NpgsqlCommand("SELECT * FROM owner", conn);
    using var reader = cmd.ExecuteReader();
    while (reader.Read())
    {
        Console.WriteLine("ID: " + reader.GetGuid(0));
        Console.WriteLine("Name: " + reader.GetString(1));
        Console.WriteLine("City: " + reader.GetString(2));
        Console.WriteLine("Telephone: " + reader.GetString(3));
    }
}
```

### 4. Update Owner

```csharp
void UpdateOwner(NpgsqlConnection conn)
{
    using var cmd = new NpgsqlCommand("UPDATE owner SET telephone = @telephone WHERE name = @name", conn);
    cmd.Parameters.AddWithValue("telephone", "888-888-8888");
    cmd.Parameters.AddWithValue("name", "John Doe");
    cmd.ExecuteNonQuery();
}
```

### 5. Delete Owner

```csharp
void DeleteOwner(NpgsqlConnection conn)
{
    using var cmd = new NpgsqlCommand("DELETE FROM owner WHERE name = @name", conn);
    cmd.Parameters.AddWithValue("name", "John Doe");
    cmd.ExecuteNonQuery();
}
```
