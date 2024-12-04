package org.example;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.services.dsql.DsqlUtilities;
import software.amazon.awssdk.regions.Region;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Properties;
import java.util.UUID;

public class Example {

    // Get a connection to Aurora DSQL.
    public static Connection getConnection(String cluster, String region) throws SQLException {

        Properties props = new Properties();

        // Use the DefaultJavaSSLFactory so that Java's default trust store can be used
        // to verify the server's root cert.
        String url = "jdbc:postgresql://" + cluster + ":5432/postgres?sslmode=verify-full&sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory";

        DsqlUtilities utilities = DsqlUtilities.builder()
                .region(Region.of(region))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();

        // The token expiration time is optional, and the default value 900 seconds
        String password = utilities.generateDbConnectAdminAuthToken(builder -> builder.hostname(cluster)
                .region(Region.of(region)));

        props.setProperty("user", "admin");
        props.setProperty("password", password);
        return DriverManager.getConnection(url, props);

    }

    public static void main(String[] args) {
        // Replace the cluster endpoint with your own
        String cluster_endpoint = System.getenv("CLUSTER_ENDPOINT");
        String region = System.getenv("REGION");
        try (Connection conn = Example.getConnection(cluster_endpoint, region)) {

            // Create a new table named owner
            Statement create = conn.createStatement();
            create.executeUpdate("CREATE TABLE IF NOT EXISTS owner (id UUID PRIMARY KEY, name VARCHAR(255), city VARCHAR(255), telephone VARCHAR(255))");
            create.close();

            // Insert some data
            UUID uuid = UUID.randomUUID();
            String insertSql = String.format("INSERT INTO owner (id, name, city, telephone) VALUES ('%s', 'John Doe', 'Anytown', '555-555-0150')", uuid);
            Statement insert = conn.createStatement();
            insert.executeUpdate(insertSql);
            insert.close();

            // Read back the data and assert they are present
            String selectSQL = "SELECT * FROM owner";
            Statement read = conn.createStatement();
            ResultSet rs = read.executeQuery(selectSQL);
            while (rs.next()) {
                assert rs.getString("id") != null;
                assert rs.getString("name").equals("John Doe");
                assert rs.getString("city").equals("Anytown");
                assert rs.getString("telephone").equals("555-555-0150");
            }

            // Delete some data
            String deleteSql = String.format("DELETE FROM owner where name='John Doe'");
            Statement delete = conn.createStatement();
            delete.executeUpdate(deleteSql);
            delete.close();
        } catch (SQLException e) {
            e.printStackTrace();
        }
        System.out.println("DONE");
    }
}
