// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

using Amazon.AuroraDsql.Npgsql;
using Microsoft.AspNetCore.Mvc.Testing;

namespace InventoryApi.IntegrationTests;

public class InventoryApiFixture : IAsyncLifetime
{
    private WebApplicationFactory<Program> _factory = default!;
    public HttpClient Client { get; private set; } = default!;

    public async Task InitializeAsync()
    {
        var endpoint = Environment.GetEnvironmentVariable("CLUSTER_ENDPOINT")
            ?? throw new InvalidOperationException("CLUSTER_ENDPOINT environment variable is required.");

        // Drop stale tables so MigrateAsync() recreates from current schema
        var config = new DsqlConfig { Host = endpoint };
        await using var dataSource = await DsqlDataSource.CreateAsync(config);
        await using var conn = await dataSource.OpenConnectionAsync();
        foreach (var table in new[] { "OrderItems", "Orders", "Products", "__EFMigrationsHistory" })
        {
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = $"DROP TABLE IF EXISTS \"{table}\"";
            await cmd.ExecuteNonQueryAsync();
        }

        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseSetting("CLUSTER_ENDPOINT", endpoint);
            });

        Client = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        Client?.Dispose();
        if (_factory is not null)
            await _factory.DisposeAsync();
    }
}

[CollectionDefinition("InventoryApi")]
public class InventoryApiCollection : ICollectionFixture<InventoryApiFixture> { }