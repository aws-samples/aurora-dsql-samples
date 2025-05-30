using System.Diagnostics;
using Amazon;
using Amazon.DSQL.Util;
using Amazon.Runtime;
using Amazon.Runtime.Credentials;
using Npgsql;

namespace example;

internal static class Example
{
    private static async Task<NpgsqlConnection> CreateConnection(
        string clusterUser, string clusterEndpoint, string regionName)
    {
        var region = RegionEndpoint.GetBySystemName(regionName);

        AWSCredentials awsCredentials = await DefaultAWSCredentialsIdentityResolver.GetCredentialsAsync();

        // Generate a fresh password token for each connection, to ensure the token is not expired when the connection
        // is established
        string password;
        string schema;
        if (clusterUser == "admin")
        {
            password = await DSQLAuthTokenGenerator.GenerateDbConnectAdminAuthTokenAsync(
                awsCredentials, region, clusterEndpoint);
            schema = "public";
        }
        else
        {
            password =
                await DSQLAuthTokenGenerator.GenerateDbConnectAuthTokenAsync(awsCredentials, region, clusterEndpoint);
            schema = "myschema";
        }

        var connBuilder = new NpgsqlConnectionStringBuilder
        {
            Host = clusterEndpoint,
            Port = 5432,
            SslMode = SslMode.VerifyFull,
            SslNegotiation = SslNegotiation.Direct,
            Database = "postgres",
            Username = clusterUser,
            Password = password,
            IncludeErrorDetail = true
        };

        var conn = new NpgsqlConnection(connBuilder.ConnectionString);
        await conn.OpenAsync();

        try
        {
            await using var setSearchPath = new NpgsqlCommand($"SET search_path = {schema}", conn);
            setSearchPath.ExecuteNonQuery();
        }
        catch
        {
            await conn.CloseAsync();
            throw;
        }

        return conn;
    }

    private static async Task ExerciseConnection(NpgsqlConnection conn)
    {
        await using var create =
            new NpgsqlCommand(@"
                CREATE TABLE IF NOT EXISTS owner (
                    id UUID NOT NULL DEFAULT gen_random_uuid(),
                    name VARCHAR(30) NOT NULL,
                    city VARCHAR(80) NOT NULL,
                    telephone VARCHAR(20) DEFAULT NULL,
                    PRIMARY KEY (id)
                )",
                conn);
        create.ExecuteNonQuery();

        // Insert some data
        await using var insert = new NpgsqlCommand(
            "INSERT INTO owner(name, city, telephone) VALUES(@name, @city, @telephone)", conn);
        insert.Parameters.AddWithValue("name", "John Doe");
        insert.Parameters.AddWithValue("city", "Anytown");
        insert.Parameters.AddWithValue("telephone", "555-555-1999");
        insert.ExecuteNonQuery();

        await using var select = new NpgsqlCommand("SELECT * FROM owner where name=@name", conn);
        select.Parameters.AddWithValue("name", "John Doe");
        await using var reader = await select.ExecuteReaderAsync();

        Debug.Assert(reader.HasRows, "no owner found");
        await reader.ReadAsync();

        // Verify the result we got is what we inserted before
        Debug.Assert(!reader.IsDBNull(reader.GetOrdinal("id")), "id is null");
        Debug.Assert(reader.GetString(reader.GetOrdinal("name")) == "John Doe", "name doesn't match");
        Debug.Assert(reader.GetString(reader.GetOrdinal("city")) == "Anytown", "city doesn't match");
        Debug.Assert(reader.GetString(reader.GetOrdinal("telephone")) == "555-555-1999", "telephone doesn't match");
        await reader.CloseAsync();

        // Clean up the table after the example. If we run the example again we do not have to worry about data inserted
        // by previous runs
        await using var delete = new NpgsqlCommand("DELETE FROM owner where name=@name", conn);
        select.Parameters.AddWithValue("name", "John Doe");
        select.ExecuteNonQuery();
    }

    public static async Task Main()
    {
        var clusterUser = Environment.GetEnvironmentVariable("CLUSTER_USER");
        Debug.Assert(clusterUser != null, "CLUSTER_USER must be set");

        var clusterEndpoint = Environment.GetEnvironmentVariable("CLUSTER_ENDPOINT");
        Debug.Assert(clusterEndpoint != null, "CLUSTER_ENDPOINT must be set");

        var region = Environment.GetEnvironmentVariable("REGION");
        Debug.Assert(region != null, "REGION must be set");

        await using var conn = await CreateConnection(clusterUser!, clusterEndpoint!, region!);
        await ExerciseConnection(conn);

        Console.WriteLine("Connection exercised successfully");
    }
}