// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

using Amazon.AuroraDsql.Npgsql;
using Npgsql;

namespace Amazon.AuroraDsql.Npgsql.Examples;

/// <summary>
/// Preferred example: demonstrates pool creation, concurrent reads,
/// transactional writes, and cleanup using the DSQL connector.
///
/// Works with both admin and non-admin users:
/// - Admin users operate in the default "public" schema
/// - Non-admin users operate in a custom "myschema" schema
/// </summary>
public static class ExamplePreferred
{
    private const int NumConcurrentQueries = 8;

    public static async Task RunAsync(string clusterEndpoint, string clusterUser = "admin")
    {
        // Determine schema based on user type
        var schema = clusterUser == "admin" ? "public" : "myschema";

        // Create a connection pool via the connector
        await using var ds = await AuroraDsql.CreateDataSourceAsync(new DsqlConfig
        {
            Host = clusterEndpoint,
            User = clusterUser,
            OccMaxRetries = 3,
            // Set search_path and pool settings via the callback
            ConfigureConnectionString = csb =>
            {
                csb.SearchPath = schema;
                csb.MaxPoolSize = 10;
                csb.MinPoolSize = 2;
            },
        });

        // Verify connectivity
        await using (var conn = await ds.OpenConnectionAsync())
        {
            await using var cmd = new NpgsqlCommand("SELECT 1", conn);
            await cmd.ExecuteScalarAsync();
        }
        Console.WriteLine("Connected to Aurora DSQL");

        // Ensure the example table exists (DDL — retried on OCC conflict)
        await ds.ExecWithRetryAsync(
            "CREATE TABLE IF NOT EXISTS example_items (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, name TEXT)");

        // --- Concurrent reads ---
        var tasks = new Task<string>[NumConcurrentQueries];
        for (var i = 0; i < NumConcurrentQueries; i++)
        {
            var workerId = i + 1;
            tasks[i] = Task.Run(async () =>
            {
                await using var conn = await ds.OpenConnectionAsync();
                await using var cmd = new NpgsqlCommand("SELECT $1::int AS worker_id", conn);
                cmd.Parameters.AddWithValue(workerId);
                var result = await cmd.ExecuteScalarAsync();
                return $"Worker {workerId} result: {result}";
            });
        }

        var results = await Task.WhenAll(tasks);
        foreach (var r in results)
            Console.WriteLine(r);
        Console.WriteLine("Concurrent reads completed");

        // --- Transactional write (INSERT + COMMIT) with OCC retry ---
        // WithTransactionRetryAsync manages BEGIN/COMMIT/ROLLBACK automatically.
        // On OCC conflict, it rolls back and re-executes with a fresh connection.
        await ds.WithTransactionRetryAsync(async conn =>
        {
            await using var insert = new NpgsqlCommand(
                "INSERT INTO example_items (name) VALUES ($1)", conn);
            insert.Parameters.AddWithValue("test-item");
            await insert.ExecuteNonQueryAsync();
        });
        Console.WriteLine("Transactional write completed");

        // --- Cleanup (DELETE) ---
        await using (var conn = await ds.OpenConnectionAsync())
        {
            await using var delete = new NpgsqlCommand(
                "DELETE FROM example_items WHERE name = $1", conn);
            delete.Parameters.AddWithValue("test-item");
            await delete.ExecuteNonQueryAsync();
        }
        Console.WriteLine("Cleanup completed");

        Console.WriteLine("Connection pool with concurrent connections exercised successfully");
    }
}
