// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace InventoryApi.IntegrationTests;

[Collection("InventoryApi")]
public class OrderEndpointTests
{
    private readonly HttpClient _client;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public OrderEndpointTests(InventoryApiFixture fixture)
    {
        _client = fixture.Client;
    }

    [Fact]
    public async Task PlaceOrder_ValidStock_ReturnsCreated()
    {
        var productId = await CreateProduct("OrderTest-Valid", 25m, 100);

        var order = new { Items = new[] { new { ProductId = productId, Quantity = 2 } } };
        var response = await _client.PostAsJsonAsync("/orders", order);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        Assert.Equal(50m, body.GetProperty("totalAmount").GetDecimal());
        Assert.Equal(1, body.GetProperty("itemCount").GetInt32());
    }

    [Fact]
    public async Task PlaceOrder_DecreasesStock()
    {
        var productId = await CreateProduct("OrderTest-Stock", 10m, 50);

        var order = new { Items = new[] { new { ProductId = productId, Quantity = 3 } } };
        await _client.PostAsJsonAsync("/orders", order);

        var productResponse = await _client.GetFromJsonAsync<JsonElement>($"/products/{productId}", JsonOptions);
        Assert.Equal(47, productResponse.GetProperty("stock").GetInt32());
    }

    [Fact]
    public async Task PlaceOrder_InsufficientStock_ReturnsBadRequest()
    {
        var productId = await CreateProduct("OrderTest-NoStock", 10m, 1);

        var order = new { Items = new[] { new { ProductId = productId, Quantity = 99 } } };
        var response = await _client.PostAsJsonAsync("/orders", order);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task PlaceOrder_MultipleItems_BatchInsert()
    {
        var productId1 = await CreateProduct("OrderTest-Multi1", 10m, 100);
        var productId2 = await CreateProduct("OrderTest-Multi2", 20m, 100);

        var order = new
        {
            Items = new[]
            {
                new { ProductId = productId1, Quantity = 2 },
                new { ProductId = productId2, Quantity = 3 }
            }
        };
        var response = await _client.PostAsJsonAsync("/orders", order);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        Assert.Equal(80m, body.GetProperty("totalAmount").GetDecimal()); // (2*10) + (3*20)
        Assert.Equal(2, body.GetProperty("itemCount").GetInt32());
    }

    [Fact]
    public async Task GetOrder_WithItems_ReturnsNavigationData()
    {
        var productId = await CreateProduct("OrderTest-Nav", 15m, 100);

        var order = new { Items = new[] { new { ProductId = productId, Quantity = 1 } } };
        var createResponse = await _client.PostAsJsonAsync("/orders", order);
        var created = await createResponse.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        var orderId = created.GetProperty("id").GetGuid();

        var response = await _client.GetAsync($"/orders/{orderId}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        var items = body.GetProperty("items").EnumerateArray().ToList();
        Assert.Single(items);
        Assert.StartsWith("OrderTest-Nav", items[0].GetProperty("productName").GetString());
        Assert.Equal(15m, items[0].GetProperty("unitPrice").GetDecimal());
    }

    [Fact]
    public async Task GetOrder_NotFound_Returns404()
    {
        var response = await _client.GetAsync($"/orders/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private async Task<Guid> CreateProduct(string name, decimal price, int stock)
    {
        var products = new[] { new { Name = $"{name}-{Guid.NewGuid():N}", Price = price, Stock = stock } };
        var response = await _client.PostAsJsonAsync("/products", products);
        response.EnsureSuccessStatusCode();
        var created = await response.Content.ReadFromJsonAsync<JsonElement[]>(JsonOptions);
        return created![0].GetProperty("id").GetGuid();
    }
}