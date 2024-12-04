using Amazon;
using System;

public class ExampleTest
{
    [Fact]
    public async Task SingleRegionSmokeTest()
    {
        // Smoke test
        await Example.ExecuteSingleRegion();
    }

    [Fact]
    public async Task MultiRegionSmokeTest()
    {
        // Smoke test
        await Example.ExecuteMultiRegion();
    }
}