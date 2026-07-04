// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

using Amazon.AuroraDsql.EntityFrameworkCore.Extensions;
using Microsoft.EntityFrameworkCore;
using InventoryApi;

var builder = WebApplication.CreateBuilder(args);

// --- Aurora DSQL + EF Core setup (IAM auth handled automatically) ---
var clusterEndpoint = builder.Configuration["CLUSTER_ENDPOINT"]
    ?? Environment.GetEnvironmentVariable("CLUSTER_ENDPOINT")
    ?? throw new InvalidOperationException(
        "Set CLUSTER_ENDPOINT in configuration or environment.");

builder.Services.AddDsqlDataSource(clusterEndpoint);
builder.Services.AddDbContext<InventoryDbContext>(
    (sp, options) => options.UseDsql(sp));

builder.Services.AddLogging(logging =>
{
    logging.AddConsole();
    logging.SetMinimumLevel(LogLevel.Information);
    logging.AddFilter("Amazon.AuroraDsql.EntityFrameworkCore", LogLevel.Debug);
    logging.AddFilter("Microsoft", LogLevel.Warning);
    logging.AddFilter("Npgsql", LogLevel.Warning);
});

var app = builder.Build();

// --- Apply pending migrations at startup ---
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
    await db.Database.MigrateAsync();
}

// --- Endpoints ---

// List products with optional filtering and pagination
app.MapGet("/products", async (
    InventoryDbContext db,
    string? name,
    int page = 1,
    int pageSize = 10) =>
{
    var query = db.Products.AsQueryable();

    if (!string.IsNullOrWhiteSpace(name))
        query = query.Where(p => p.Name.Contains(name));

    var products = await query
        .OrderBy(p => p.Name)
        .Skip((page - 1) * pageSize)
        .Take(pageSize)
        .Select(p => new { p.Id, p.Name, p.Price, p.Stock, p.CreatedAt })
        .ToListAsync();

    return Results.Ok(products);
});

// Get single product
app.MapGet("/products/{id:guid}", async (Guid id, InventoryDbContext db) =>
{
    var product = await db.Products.FindAsync(id);
    return product is null ? Results.NotFound() : Results.Ok(product);
});

// Create products (batch insert)
app.MapPost("/products", async (CreateProductRequest[] requests, InventoryDbContext db) =>
{
    var products = requests.Select(r => new Product
    {
        Name = r.Name,
        Price = r.Price,
        Stock = r.Stock,
        CreatedAt = DateTime.UtcNow
    }).ToList();

    db.Products.AddRange(products);
    await db.SaveChangesAsync();

    return Results.Created("/products", products.Select(p => new { p.Id, p.Name }));
});

// Place order — OCC retry via ExecuteInTransactionAsync
app.MapPost("/orders", async (PlaceOrderRequest request, InventoryDbContext db) =>
{
    var strategy = db.Database.CreateExecutionStrategy();
    var orderId = Guid.NewGuid();
    IResult? validationError = null;

    await strategy.ExecuteInTransactionAsync(
        db,
        async (ctx, ct) =>
        {
            ctx.ChangeTracker.Clear();
            validationError = null;

            var order = new Order
            {
                Id = orderId,
                CreatedAt = DateTime.UtcNow,
                TotalAmount = 0m
            };

            foreach (var item in request.Items)
            {
                var product = await ctx.Products.FindAsync(new object[] { item.ProductId }, ct);
                if (product is null)
                {
                    validationError = Results.BadRequest($"Product {item.ProductId} not found.");
                    return;
                }

                if (product.Stock < item.Quantity)
                {
                    validationError = Results.BadRequest(
                        $"Insufficient stock for {product.Name}. Available: {product.Stock}");
                    return;
                }

                product.Stock -= item.Quantity;

                order.Items.Add(new OrderItem
                {
                    Id = Guid.NewGuid(),
                    ProductId = product.Id,
                    Quantity = item.Quantity,
                    UnitPrice = product.Price
                });
            }

            order.TotalAmount = order.Items.Sum(i => i.Quantity * i.UnitPrice);
            ctx.Orders.Add(order);
            await ctx.SaveChangesAsync(ct);
        },
        async (ctx, ct) =>
        {
            ctx.ChangeTracker.Clear();
            return await ctx.Orders.AsNoTracking().AnyAsync(o => o.Id == orderId, ct);
        });

    if (validationError is not null)
        return validationError;

    var created = await db.Orders
        .Include(o => o.Items)
        .FirstAsync(o => o.Id == orderId);

    return Results.Created($"/orders/{orderId}",
        new { created.Id, created.TotalAmount, ItemCount = created.Items.Count });
});

// Get order with items — demonstrates Include/ThenInclude navigation
app.MapGet("/orders/{id:guid}", async (Guid id, InventoryDbContext db) =>
{
    var order = await db.Orders
        .Include(o => o.Items)
            .ThenInclude(i => i.Product)
        .FirstOrDefaultAsync(o => o.Id == id);

    if (order is null)
        return Results.NotFound();

    return Results.Ok(new
    {
        order.Id,
        order.CreatedAt,
        order.TotalAmount,
        Items = order.Items.Select(i => new
        {
            i.Id,
            ProductName = i.Product?.Name,
            i.Quantity,
            i.UnitPrice
        })
    });
});

app.Run();

// --- Request DTOs ---
public record CreateProductRequest(string Name, decimal Price, int Stock);
public record PlaceOrderRequest(List<OrderItemRequest> Items);
public record OrderItemRequest(Guid ProductId, int Quantity);