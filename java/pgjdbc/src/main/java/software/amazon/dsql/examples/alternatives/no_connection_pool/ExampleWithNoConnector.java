/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package software.amazon.dsql.examples.alternatives.no_connection_pool;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.services.dsql.DsqlUtilities;
import software.amazon.awssdk.services.dsql.model.GenerateAuthTokenRequest;
import software.amazon.awssdk.regions.Region;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Properties;

public class ExampleWithNoConnector {

    // Get a connection to Aurora DSQL.
    public static Connection getConnection(String endpoint, String user, String region) throws SQLException {
        DsqlUtilities utilities = DsqlUtilities.builder()
                .region(Region.of(region))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();

        // The token expiration time is optional, and the default value is 900 seconds
        GenerateAuthTokenRequest tokenGenerator = GenerateAuthTokenRequest.builder()
                .hostname(endpoint)
                .region(Region.of(region))
                .build();

        // Generate a fresh password token for each connection, to ensure the token is
        // not expired when the connection is established
        String password;
        if (user.equals("admin")) {
            password = utilities.generateDbConnectAdminAuthToken(tokenGenerator);
        } else {
            password = utilities.generateDbConnectAuthToken(tokenGenerator);
        }

        Properties props = new Properties();
        props.setProperty("user", user);
        props.setProperty("password", password);
        // Use the DefaultJavaSSLFactory so that Java's default trust store can be used
        // to verify the server's root cert.
        props.setProperty("sslmode", "verify-full");
        props.setProperty("sslfactory", "org.postgresql.ssl.DefaultJavaSSLFactory");
        props.setProperty("sslNegotiation", "direct");

        String url = "jdbc:postgresql://" + endpoint + ":5432/postgres";

        return DriverManager.getConnection(url, props);
    }

    public static void main(String[] args) throws SQLException {
        String clusterEndpoint = System.getenv("CLUSTER_ENDPOINT");
        assert clusterEndpoint != null : "CLUSTER_ENDPOINT environment variable is not set";

        String clusterUser = System.getenv("CLUSTER_USER");
        assert clusterUser != null : "CLUSTER_USER environment variable is not set";

        String region = System.getenv("REGION");
        assert region != null : "REGION environment variable is not set";

        try (Connection conn = ExampleWithNoConnector.getConnection(clusterEndpoint, clusterUser, region)) {
            if (!clusterUser.equals("admin")) {
                Statement setSchema = conn.createStatement();
                setSchema.execute("SET search_path=myschema");
                setSchema.close();
            }
            // Create a new table named owner
            Statement create = conn.createStatement();
            create.executeUpdate("""
                    CREATE TABLE IF NOT EXISTS owner(
                    id uuid NOT NULL DEFAULT gen_random_uuid(),
                    name varchar(30) NOT NULL,
                    city varchar(80) NOT NULL,
                    telephone varchar(20) DEFAULT NULL,
                    PRIMARY KEY (id))""");
            create.close();

            // Insert some data
            Statement insert = conn.createStatement();
            insert.executeUpdate(
                    "INSERT INTO owner (name, city, telephone) VALUES ('John Doe', 'Anytown', '555-555-1999')");
            insert.close();

            // Read back the data and assert they are present
            String selectSQL = "SELECT * FROM owner";
            Statement read = conn.createStatement();
            ResultSet rs = read.executeQuery(selectSQL);
            while (rs.next()) {
                assert rs.getString("id") != null;
                assert rs.getString("name").equals("John Doe");
                assert rs.getString("city").equals("Anytown");
                assert rs.getString("telephone").equals("555-555-1999");
            }

            // Delete some data
            String deleteSql = String.format("DELETE FROM owner where name='John Doe'");
            Statement delete = conn.createStatement();
            delete.executeUpdate(deleteSql);
            delete.close();
        }
        System.out.println("Connection exercised successfully");
    }
}
