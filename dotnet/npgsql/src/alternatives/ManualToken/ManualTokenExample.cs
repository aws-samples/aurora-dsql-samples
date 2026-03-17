// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

using Amazon;
using Amazon.DSQL.Util;
using Amazon.Runtime;
using Amazon.Runtime.Credentials;
using Npgsql;

namespace Amazon.AuroraDsql.Npgsql.Examples.Alternatives;

/// <summary>
/// Demonstrates manual IAM token generation for Aurora DSQL without using
/// the connector. Use this approach when you need custom token generation
/// logic, non-standard authentication flows, or want to understand the
/// underlying mechanism.
///
/// Requires environment variables: CLUSTER_ENDPOINT, CLUSTER_USER, REGION.
/// </summary>
public static class ManualTokenExample
{
    public static async Task RunAsync(string clusterEndpoint)
    {
        var clusterUser = Environment.GetEnvironmentVariable("CLUSTER_USER")
            ?? throw new InvalidOperationException("CLUSTER_USER environment variable is not set");
        var regionName = Environment.GetEnvironmentVariable("REGION")
            ?? throw new InvalidOperationException("REGION environment variable is not set");

        var region = RegionEndpoint.GetBySystemName(regionName);

        // Resolve credentials once; token generation is a local SigV4 presign (no network call)
        AWSCredentials credentials = await DefaultAWSCredentialsIdentityResolver.GetCredentialsAsync();

        // Build a data source with per-connection token refresh
        var csb = new NpgsqlConnectionStringBuilder
        {
            Host = clusterEndpoint,
            Port = 5432,
            SslMode = SslMode.VerifyFull,
            SslNegotiation = SslNegotiation.Direct,
            Database = "postgres",
            Username = clusterUser,
            NoResetOnClose = true, // DSQL manages session state automatically
        };

        var builder = new NpgsqlDataSourceBuilder(csb.ConnectionString);

        // Generate a fresh IAM token for each physical connection
        builder.UsePasswordProvider(
            passwordProvider: (_) =>
                GenerateToken(clusterEndpoint, clusterUser, region, credentials),
            passwordProviderAsync: (_, _) =>
                new ValueTask<string>(
                    GenerateToken(clusterEndpoint, clusterUser, region, credentials)));

        await using var dataSource = builder.Build();

        // Verify connectivity
        await using (var conn = await dataSource.OpenConnectionAsync())
        {
            await using var cmd = new NpgsqlCommand("SELECT 1", conn);
            await cmd.ExecuteScalarAsync();
        }
        Console.WriteLine("Connected to Aurora DSQL (manual token)");

        // Ensure the example table exists
        await using (var conn = await dataSource.OpenConnectionAsync())
        {
            await using var create = new NpgsqlCommand(
                "CREATE TABLE IF NOT EXISTS manual_token_items (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, name TEXT)",
                conn);
            await create.ExecuteNonQueryAsync();
        }

        // Insert a row
        await using (var conn = await dataSource.OpenConnectionAsync())
        {
            await using var insert = new NpgsqlCommand(
                "INSERT INTO manual_token_items (name) VALUES ($1)", conn);
            insert.Parameters.AddWithValue("manual-token-item");
            await insert.ExecuteNonQueryAsync();
        }
        Console.WriteLine("Insert completed");

        // Read it back
        await using (var conn = await dataSource.OpenConnectionAsync())
        {
            await using var select = new NpgsqlCommand(
                "SELECT name FROM manual_token_items WHERE name = $1", conn);
            select.Parameters.AddWithValue("manual-token-item");
            var name = (string?)await select.ExecuteScalarAsync();
            Console.WriteLine($"Read back: {name}");
        }

        // Cleanup
        await using (var conn = await dataSource.OpenConnectionAsync())
        {
            await using var delete = new NpgsqlCommand(
                "DELETE FROM manual_token_items WHERE name = $1", conn);
            delete.Parameters.AddWithValue("manual-token-item");
            await delete.ExecuteNonQueryAsync();
        }
        Console.WriteLine("Cleanup completed");

        Console.WriteLine("Manual token connection exercised successfully");
    }

    private static string GenerateToken(
        string clusterEndpoint, string user, RegionEndpoint region,
        AWSCredentials credentials)
    {
        return user == "admin"
            ? DSQLAuthTokenGenerator.GenerateDbConnectAdminAuthToken(
                credentials, region, clusterEndpoint)
            : DSQLAuthTokenGenerator.GenerateDbConnectAuthToken(
                credentials, region, clusterEndpoint);
    }
}
