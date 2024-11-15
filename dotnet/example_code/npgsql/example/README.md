# .NET with Aurora DSQL

## Table of Contents

1. Prerequisites
2. Example using .NET with Npgsql to interact with Aurora DSQL

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

### Example using .NET with Npgsql to interact with Aurora DSQL

```csharp
using Npgsql;
using Amazon;

class Example
{
    public static async Task Run()
    {
        // Please replace with your own cluster endpoint
        string clusterEndpoint = "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws";
        RegionEndpoint region = RegionEndpoint.USEast1;

        // Connect to a PostgreSQL database.
        const string username = "admin";
        // The token expiration time is optional, and the default value 900 seconds
        string password = TokenGenerator.GenerateAuthToken(clusterEndpoint, region);
        const string database = "postgres";
        var connString = "Host=" + clusterEndpoint + ";Username=" + username + ";Password=" + password + ";Database=" + database + ";Port=" + 5432 + ";SSLMode=VerifyFull;";

        var conn = new NpgsqlConnection(connString);
        await conn.OpenAsync();

        // Create a table.
        using var create = new NpgsqlCommand("CREATE TABLE IF NOT EXISTS owner (id UUID PRIMARY KEY, name VARCHAR(30) NOT NULL, city VARCHAR(80) NOT NULL, telephone VARCHAR(20))", conn);
        create.ExecuteNonQuery();

        // Create an owner.
        var uuid = Guid.NewGuid();
        using var insert = new NpgsqlCommand("INSERT INTO owner(id, name, city, telephone) VALUES(@id, @name, @city, @telephone)", conn);
        insert.Parameters.AddWithValue("id", uuid);
        insert.Parameters.AddWithValue("name", "John Doe");
        insert.Parameters.AddWithValue("city", "Anytown");
        insert.Parameters.AddWithValue("telephone", "555-555-5555");
        insert.ExecuteNonQuery();

        // Read the owner.
        using var select = new NpgsqlCommand("SELECT * FROM owner where id=@id", conn);
        select.Parameters.AddWithValue("id", uuid);
        using var reader = await select.ExecuteReaderAsync();
        System.Diagnostics.Debug.Assert(reader.HasRows, "no owner found");

        System.Diagnostics.Debug.WriteLine(reader.Read());

        // Close the connection.
        conn.Close();
    }
}
```
