/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package software.amazon.dsql.examples;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * Aurora DSQL example using HikariCP with Aurora DSQL JDBC Connector
 * <p>
 * This implementation provides:
 * <ul>
 * <li>HikariCP connection pooling optimized for Aurora DSQL</li>
 * <li>Automatic IAM authentication via Aurora DSQL JDBC Connector</li>
 * <li>Connection Management: Automatically handles connection lifecycle</li>
 * <li>Monitoring: Built-in metrics and leak detection</li>
 * <li>Configuration: Extensive tuning options for optimal performance</li>
 * <li>Production-ready configuration with connection validation</li>
 * </ul>
 */
public class ExamplePreferred {

    private final HikariDataSource dataSource;

    public ExamplePreferred(String endpoint, String user) {
        this.dataSource = initializeConnectionPool(endpoint, user);
    }

    private HikariDataSource initializeConnectionPool(String endpoint, String username) {
        // Build JDBC URL using Aurora DSQL JDBC Connector format
        String jdbcUrl = "jdbc:aws-dsql:postgresql://" + endpoint;

        // Configure HikariCP
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(jdbcUrl);
        config.setUsername(username);

        // Note: SSL is configured automatically by the connector with secure defaults:
        // - sslmode=verify-full
        // - sslNegotiation=direct
        // - sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory
        // You can override these if needed by setting the properties explicitly.

        // HikariCP pool configuration optimized for Aurora DSQL
        config.setPoolName("AuroraDSQLPool");
        config.setMaximumPoolSize(20);                    // Production pool size
        config.setMinimumIdle(5);                         // Keep connections ready
        config.setConnectionTimeout(30000);               // 30 seconds
        config.setIdleTimeout(600000);                    // 10 minutes
        config.setMaxLifetime(3300000);                   // 55 minutes (connector handles token refresh)
        config.setLeakDetectionThreshold(60000);          // 60 seconds

        // Connection validation
        config.setConnectionTestQuery("SELECT 1");
        config.setValidationTimeout(5000);                // 5 seconds

        config.setAutoCommit(true);
        config.setReadOnly(false);
        if (!username.equals("admin")) {
            config.setSchema("myschema");
        }

        // Monitoring
        config.setRegisterMbeans(true);

        return new HikariDataSource(config);
    }

    /**
     * Get a connection from the managed pool
     */
    public Connection getConnection() throws SQLException {
        return this.dataSource.getConnection();
    }

    private void executeExample(Connection conn, int connectionNumber) throws SQLException {
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

        // Insert some data with a unique identifier
        String uniqueName = "John Doe " + System.currentTimeMillis() + "_" + connectionNumber;
        Statement insert = conn.createStatement();
        insert.executeUpdate(
                "INSERT INTO owner (name, city, telephone) VALUES ('" + uniqueName + "', 'Anytown', '555-555-1991')");
        insert.close();

        // Read back the data and verify
        String selectSQL = "SELECT * FROM owner WHERE name = '" + uniqueName + "'";
        Statement read = conn.createStatement();
        ResultSet rs = read.executeQuery(selectSQL);
        while (rs.next()) {
            assert rs.getString("id") != null;
            assert rs.getString("name").equals(uniqueName);
            assert rs.getString("city").equals("Anytown");
            assert rs.getString("telephone").equals("555-555-1991");
            System.out.println("Data verified: " + rs.getString("name") + " from " + rs.getString("city"));
        }
        read.close();
    }

    public static void main(String[] args) throws SQLException {
        System.out.println("Starting Aurora DSQL example");
        System.out.println();

        String clusterEndpoint = System.getenv("CLUSTER_ENDPOINT");
        assert clusterEndpoint != null : "CLUSTER_ENDPOINT environment variable is not set";

        String clusterUser = System.getenv("CLUSTER_USER");
        assert clusterUser != null : "CLUSTER_USER environment variable is not set";

        System.out.println("Initializing Aurora DSQL example...");
        ExamplePreferred example = new ExamplePreferred(clusterEndpoint, clusterUser);
        System.out.println("Example initialized!");
        System.out.println();

        try {

            // Demonstrate connection pooling with multiple concurrent connections
            System.out.println("Testing connection pool with multiple connections...");

            try (Connection conn1 = example.getConnection();
                 Connection conn2 = example.getConnection();
                 Connection conn3 = example.getConnection()) {

                System.out.println("Connection 1 obtained from pool");
                example.executeExample(conn1, 1);

                System.out.println("Connection 2 obtained from pool");
                example.executeExample(conn2, 2);

                System.out.println("Connection 3 obtained from pool");
                example.executeExample(conn3, 3);
            }

            try (Connection conn = example.getConnection()) {
                Statement cleanup = conn.createStatement();
                int deletedRows = cleanup.executeUpdate("DELETE FROM owner WHERE name LIKE '%John Doe%'");
                cleanup.close();

                System.out.println("Cleaned up " + deletedRows + " test records");
            }

        } finally {
            // Graceful shutdown
            System.out.println("Shutting down example...");
            // Close connection pool
            if (example.dataSource != null && !example.dataSource.isClosed()) {
                example.dataSource.close();
            }

            System.out.println("Aurora DSQL example shutdown completed");
        }

        System.out.println();
        System.out.println("Aurora DSQL example completed successfully!");
    }
}
