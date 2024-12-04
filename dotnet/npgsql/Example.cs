using Npgsql;
using Amazon;

class Example
{
    public static async Task Run(string clusterEndpoint)
    {
        RegionEndpoint region = RegionEndpoint.USEast1;

        // Connect to a PostgreSQL database.
        const string username = "admin";
        // The token expiration time is optional, and the default value 900 seconds
        string password = TokenGenerator.GenerateDbConnectAdminAuthToken(clusterEndpoint, region, "DbConnectAdmin");
        const string database = "postgres";
        var connString = "Host=" + clusterEndpoint + ";Username=" + username + ";Password=" + password + ";Database=" + database + ";Port=" + 5432 + ";SSLMode=VerifyFull;";

        var conn = new NpgsqlConnection(connString);
        await conn.OpenAsync();

        // Create a table.
        using var create = new NpgsqlCommand("CREATE TABLE IF NOT EXISTS owner (id UUID PRIMARY KEY, name VARCHAR(30) NOT NULL, city VARCHAR(80) NOT NULL, telephone VARCHAR(20))", conn);
        create.ExecuteNonQuery();

        // Create an owner.
        var uuid = Guid.NewGuid();
        using var insert = new NpgsqlCommand("INSERT INTO owner(id, name, city, telephone) VALUES(@id, @name, @city, @telephone)", conn);
        insert.Parameters.AddWithValue("id", uuid);
        insert.Parameters.AddWithValue("name", "John Doe");
        insert.Parameters.AddWithValue("city", "Anytown");

        insert.Parameters.AddWithValue("telephone", "555-555-0190");

        insert.ExecuteNonQuery();

        // Read the owner.
        using var select = new NpgsqlCommand("SELECT * FROM owner where id=@id", conn);
        select.Parameters.AddWithValue("id", uuid);
        using var reader = await select.ExecuteReaderAsync();
        System.Diagnostics.Debug.Assert(reader.HasRows, "no owner found");

        System.Diagnostics.Debug.WriteLine(reader.Read());

        reader.Close();

        using var delete = new NpgsqlCommand("DELETE FROM owner where id=@id", conn);
        select.Parameters.AddWithValue("id", uuid);
        select.ExecuteNonQuery();

        // Close the connection.
        conn.Close();
    }
}
