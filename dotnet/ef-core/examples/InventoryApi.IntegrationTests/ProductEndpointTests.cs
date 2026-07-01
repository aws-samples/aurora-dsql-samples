// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace InventoryApi.IntegrationTests;

[Collection("InventoryApi")]
public class ProductEndpointTests
{
    private readonly HttpClient _client;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public ProductEndpointTests(InventoryApiFixture fixture)
    {
        _client = fixture.Client;
    }

    [Fact]
    public async Task CreateProducts_BatchInsert_ReturnsCreated()
    {
        var products = new[]
        {
            new { Name = "Laptop", Price = 999.99m, Stock = 50 },
            new { Name = "Mouse", Price = 29.99m, Stock = 200 }
        };

        var response = await _client.PostAsJsonAsync("/products", products);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task GetProducts_ReturnsOk()
    {
        var response = await _client.GetAsync("/products");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var content = await response.Content.ReadAsStringAsync();
        Assert.NotNull(content);
    }

    [Fact]
    public async Task GetProducts_WithNameFilter_FiltersResults()
    {
        var uniqueName = $"FilterTest-{Guid.NewGuid():N}";
        var products = new[]
        {
            new { Name = uniqueName, Price = 10m, Stock = 5 },
            new { Name = "Other-Product", Price = 20m, Stock = 10 }
        };
        await _client.PostAsJsonAsync("/products", products);

        var response = await _client.GetAsync($"/products?name={uniqueName}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var items = await response.Content.ReadFromJsonAsync<JsonElement[]>(JsonOptions);
        Assert.NotNull(items);
        Assert.Single(items);
    }

    [Fact]
    public async Task GetProducts_WithPagination_RespectsPageSize()
    {
        var prefix = $"Page-{Guid.NewGuid():N}";
        var products = Enumerable.Range(1, 5)
            .Select(i => new { Name = $"{prefix}-{i}", Price = 10m * i, Stock = i })
            .ToArray();
        await _client.PostAsJsonAsync("/products", products);

        var response = await _client.GetAsync($"/products?name={prefix}&page=1&pageSize=2");

        var items = await response.Content.ReadFromJsonAsync<JsonElement[]>(JsonOptions);
        Assert.NotNull(items);
        Assert.Equal(2, items.Length);
    }

    [Fact]
    public async Task GetProductById_Exists_ReturnsOk()
    {
        var products = new[] { new { Name = $"ById-{Guid.NewGuid():N}", Price = 42m, Stock = 10 } };
        var createResponse = await _client.PostAsJsonAsync("/products", products);
        var created = await createResponse.Content.ReadFromJsonAsync<JsonElement[]>(JsonOptions);
        var id = created![0].GetProperty("id").GetGuid();

        var response = await _client.GetAsync($"/products/{id}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetProductById_NotFound_Returns404()
    {
        var response = await _client.GetAsync($"/products/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}