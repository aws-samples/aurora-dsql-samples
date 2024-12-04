using Npgsql;
using Amazon;
using System;

public class ExampleTest
{
    [Fact]
    public async Task TestBasicConnectivity()
    {
        // Smoke test
        await Example.Run(Environment.GetEnvironmentVariable("CLUSTER_ENDPOINT"));
    }
}