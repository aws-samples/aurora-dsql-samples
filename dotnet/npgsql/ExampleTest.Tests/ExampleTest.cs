using Npgsql;
using Amazon;


public class ExampleTest
{
    [Fact]
    public async Task TestBasicConnectivity()
    {
        // Smoke test
        await Example.Run();
    }
}