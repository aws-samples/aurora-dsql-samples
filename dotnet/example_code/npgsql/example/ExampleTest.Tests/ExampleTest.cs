using Npgsql;
using Amazon;
using Example;


namespace Example.ExampleTest.Tests
{
    public class ExampleTest
    {
        [Fact]
        public async Task TestBasicConnectivity()
        {
            string clusterEndpoint = "oaabtthvldzvyq2xic4twlbcpu.c0001.us-east-1.prod.sql.axdb.aws.dev";
            RegionEndpoint region = RegionEndpoint.USEast1;

            using var conn = await ConnectionUtil.GetConnection(clusterEndpoint, region);

            using var cmd = new NpgsqlCommand("SELECT 1", conn);
            using var reader = cmd.ExecuteReader();
            reader.Read();
            int result = reader.GetInt32(0);
            Assert.Equal(1, result);
        }
    }
}