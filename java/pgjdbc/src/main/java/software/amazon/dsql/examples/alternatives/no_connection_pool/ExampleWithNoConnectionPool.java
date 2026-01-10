/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package software.amazon.dsql.examples.alternatives.no_connection_pool;


import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Properties;

public class ExampleWithNoConnectionPool {

    // Get a connection to Aurora DSQL.
    public static Connection getConnection(String endpoint, String user) throws SQLException {
        Properties props = new Properties();
        props.setProperty("user", user);

        // Note: SSL is configured automatically by the connector with secure defaults.
        // No explicit SSL configuration needed.

        String url = "jdbc:aws-dsql:postgresql://" + endpoint;

        return DriverManager.getConnection(url, props);
    }

    public static void main(String[] args) throws SQLException {
        String clusterEndpoint = System.getenv("CLUSTER_ENDPOINT");
        assert clusterEndpoint != null : "CLUSTER_ENDPOINT environment variable is not set";

        String clusterUser = System.getenv("CLUSTER_USER");
        assert clusterUser != null : "CLUSTER_USER environment variable is not set";

        try (Connection conn = ExampleWithNoConnectionPool.getConnection(clusterEndpoint, clusterUser)) {
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
