using Npgsql;
using Example;
using Amazon;

string clusterEndpoint = "iyabtsicv4n64az4jwlngi2sgm.c0001.us-east-1.prod.sql.axdb.aws.dev";
RegionEndpoint region = RegionEndpoint.USEast1;

using var conn = await ConnectionUtil.GetConnection(clusterEndpoint, region);

CreateTable(conn);
CreateOwner(conn);
ReadOwner(conn);
UpdateOwner(conn);
ReadOwner(conn);
DeleteOwner(conn);
DropTable(conn);

void CreateTable(NpgsqlConnection conn) 
{
    using var cmd = new NpgsqlCommand("CREATE TABLE IF NOT EXISTS owner (id UUID PRIMARY KEY, name VARCHAR(30) NOT NULL, city VARCHAR(80) NOT NULL, telephone VARCHAR(20))", conn);
    cmd.ExecuteNonQuery();
}

void CreateOwner(NpgsqlConnection conn)
{
    using var cmd = new NpgsqlCommand("INSERT INTO owner(id, name, city, telephone) VALUES(@id, @name, @city, @telephone)", conn);
    cmd.Parameters.AddWithValue("id", Guid.NewGuid());
    cmd.Parameters.AddWithValue("name", "John Doe");
    cmd.Parameters.AddWithValue("city", "Las Vegas");
    cmd.Parameters.AddWithValue("telephone", "555-555-5555");
    cmd.ExecuteNonQuery();
}

void ReadOwner(NpgsqlConnection conn)
{
    using var cmd = new NpgsqlCommand("SELECT * FROM owner", conn);
    using var reader = cmd.ExecuteReader();
    while (reader.Read())
    {
        Console.WriteLine("ID: " + reader.GetGuid(0));
        Console.WriteLine("Name: " + reader.GetString(1));
        Console.WriteLine("City: " + reader.GetString(2));
        Console.WriteLine("Telephone: " + reader.GetString(3));
    }
}

void UpdateOwner(NpgsqlConnection conn)
{
    using var cmd = new NpgsqlCommand("UPDATE owner SET telephone = @telephone WHERE name = @name", conn);
    cmd.Parameters.AddWithValue("telephone", "888-888-8888");
    cmd.Parameters.AddWithValue("name", "John Doe");
    cmd.ExecuteNonQuery();
}

void DeleteOwner(NpgsqlConnection conn)
{
    using var cmd = new NpgsqlCommand("DELETE FROM owner WHERE name = @name", conn);
    cmd.Parameters.AddWithValue("name", "John Doe");
    cmd.ExecuteNonQuery();
}

void DropTable(NpgsqlConnection conn) 
{
    using var cmd = new NpgsqlCommand("DROP TABLE IF EXISTS owner", conn);
    cmd.ExecuteNonQuery();
}
