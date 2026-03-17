// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

using Amazon.AuroraDsql.Npgsql;
using Npgsql;

namespace Amazon.AuroraDsql.Npgsql.Examples.Alternatives;

/// <summary>
/// Demonstrates a single (unpooled) connection to Aurora DSQL.
/// Use this approach for scripts or simple use cases where a
/// connection pool is unnecessary.
/// </summary>
public static class SingleConnectionExample
{
    public static async Task RunAsync(string clusterEndpoint)
    {
        await using var conn = await AuroraDsql.ConnectAsync(new DsqlConfig
        {
            Host = clusterEndpoint,
        });

        // Verify connectivity
        await using var ping = conn.CreateCommand("SELECT 1");
        await ping.ExecuteScalarAsync();
        Console.WriteLine("Connected to Aurora DSQL (single connection)");

        // Ensure the example table exists
        await using var create = conn.CreateCommand(
            "CREATE TABLE IF NOT EXISTS single_conn_items (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, name TEXT)");
        await create.ExecuteNonQueryAsync();

        // Insert a row
        await using var insert = conn.CreateCommand(
            "INSERT INTO single_conn_items (name) VALUES ($1)");
        insert.Parameters.AddWithValue("single-conn-item");
        await insert.ExecuteNonQueryAsync();
        Console.WriteLine("Insert completed");

        // Read it back
        await using var select = conn.CreateCommand(
            "SELECT name FROM single_conn_items WHERE name = $1");
        select.Parameters.AddWithValue("single-conn-item");
        var name = (string?)await select.ExecuteScalarAsync();
        Console.WriteLine($"Read back: {name}");

        // Cleanup
        await using var delete = conn.CreateCommand(
            "DELETE FROM single_conn_items WHERE name = $1");
        delete.Parameters.AddWithValue("single-conn-item");
        await delete.ExecuteNonQueryAsync();
        Console.WriteLine("Cleanup completed");

        Console.WriteLine("Single connection exercised successfully");
    }
}
