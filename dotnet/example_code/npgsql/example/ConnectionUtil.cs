using Npgsql;
using Amazon;

namespace Example
{
    public static class ConnectionUtil
    {
        public static async Task<NpgsqlConnection> GetConnection(string cluster, RegionEndpoint region)
        {
            const string username = "axdb_superuser";
            string password = TokenGenerator.GenerateAuthToken(cluster, region);;
            const string database = "postgres";
            var connString = "Host=" + cluster + ";Username=" + username + ";Password=" + password + ";Database=" + database + ";Port=" + 5432 + ";SSLMode=Require;";

            var conn = new NpgsqlConnection(connString);
            await conn.OpenAsync();
            return conn;
        }
    }
}
