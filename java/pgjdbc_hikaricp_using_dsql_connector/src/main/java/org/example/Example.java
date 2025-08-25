package org.example;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * Aurora DSQL Connection Manager with HikariCP and Aurora DSQL JDBC Connector
 * <p>
 * This implementation provides:
 * <ul>
 * <li>HikariCP connection pooling optimized for Aurora DSQL using Aurora DSQL JDBC Connector</li>
 * <li>Automatic IAM authentication and token management via Aurora DSQL JDBC Connector</li>
 * <li>Connection Management: Automatically handles connection lifecycle and refresh</li>
 * <li>Monitoring: Built-in metrics and leak detection</li>
 * <li>Configuration: Extensive tuning options for optimal performance</li>
 * <li>Thread-safe singleton pattern with graceful shutdown</li>
 * <li>Production-ready configuration with connection validation</li>
 * <li>Prepared statement persistence across connection refreshes</li>
 * <li>Transaction safety with connection refresh deferral</li>
 * </ul>
 */
public class Example {

    private final HikariDataSource dataSource;
    private final String user;

    public Example(String url, String user) {
        if (url == null || url.isEmpty()) {
            throw new IllegalArgumentException("URL cannot be null or empty");
        }
        if (user == null || user.isEmpty()) {
            throw new IllegalArgumentException("User cannot be null or empty");
        }
        
        this.user = user;
        this.dataSource = initializeConnectionPool(url, user);
    }

    private HikariDataSource initializeConnectionPool(String url, String username) {
        if (url == null || url.isEmpty()) {
            throw new IllegalArgumentException("URL cannot be null or empty");
        }
        if (username == null || username.isEmpty()) {
            throw new IllegalArgumentException("Username cannot be null or empty");
        }
        
        // Configure HikariCP with Aurora DSQL JDBC Connector
        HikariConfig config = new HikariConfig();
        
        // Aurora DSQL JDBC Connector configuration
        config.setDriverClassName("software.amazon.dsql.jdbc.DSQLConnector");
        
        // Set the JDBC URL (supports both DSQL-style and PostgreSQL JDBC URLs)
        config.setJdbcUrl(url);
        config.setUsername(username);
        
        // Aurora DSQL specific properties
        config.addDataSourceProperty("token-duration-secs", "28800"); // 8 hours
        
        // HikariCP pool configuration optimized for Aurora DSQL
        config.setPoolName("AuroraDSQLPool");
        config.setMaximumPoolSize(20);                    // Production pool size
        config.setMinimumIdle(5);                         // Keep connections ready
        config.setConnectionTimeout(30000);               // 30 seconds
        config.setIdleTimeout(300000);                    // 5 minutes (shorter than connection expiry)
        config.setMaxLifetime(3000000);                   // 50 minutes (shorter than Aurora DSQL's 60-minute limit)
        config.setLeakDetectionThreshold(60000);          // 60 seconds

        // Connection validation
        config.setConnectionTestQuery("SELECT 1");
        config.setValidationTimeout(5000);                // 5 seconds

        config.setAutoCommit(true);
        config.setReadOnly(false);
        
        // Schema configuration for non-admin users
        if (!username.equals("admin")) {
            config.setSchema("myschema");
        }

        // Monitoring
        config.setRegisterMbeans(true);

        return new HikariDataSource(config);
    }

    /**
     * Get a connection from the managed pool
     * The Aurora DSQL JDBC Connector handles token generation and refresh automatically
     */
    public Connection getConnection() throws SQLException {
        if (this.dataSource == null) {
            throw new SQLException("DataSource is not initialized");
        }
        return this.dataSource.getConnection();
    }

    private void executeExample(Connection conn, int connectionNumber) throws SQLException {
        if (conn == null) {
            throw new SQLException("Connection cannot be null");
        }
        
        //cleanup
        //dropSampleTable(conn);

        // Create a new table named owner (Aurora DSQL compatible)
        Statement create = conn.createStatement();
        if (create != null) {
            create.executeUpdate("""
                    CREATE TABLE IF NOT EXISTS owner(
                    id uuid NOT NULL DEFAULT gen_random_uuid(),
                    name varchar(30) NOT NULL,
                    city varchar(80) NOT NULL,
                    telephone varchar(20) DEFAULT NULL)""");
            create.close();
        }

        // Insert some data with a unique identifier
        String uniqueName = "John Doe " + System.currentTimeMillis() + "_" + connectionNumber;
        Statement insert = conn.createStatement();
        if (insert != null) {
            insert.executeUpdate(
                    "INSERT INTO owner ( name, city, telephone) VALUES ( '" + uniqueName + "', 'Anytown', '555-555-1991')");
            insert.close();
        }

        // Read back the data and verify
        String selectSQL = "SELECT * FROM owner WHERE name = '" + uniqueName + "'";
        Statement read = conn.createStatement();
        if (read != null) {
            ResultSet rs = read.executeQuery(selectSQL);
            if (rs != null) {
                while (rs.next()) {
                    String id = rs.getString("id");
                    String name = rs.getString("name");
                    String city = rs.getString("city");
                    String telephone = rs.getString("telephone");
                    
                    assert id != null;
                    assert name != null && name.equals(uniqueName);
                    assert city != null && city.equals("Anytown");
                    assert telephone != null && telephone.equals("555-555-1991");
                    System.out.println("Data verified: " + name + " from " + city + " (ID: " + id + ")");
                }
            }
            read.close();
        }
    }

    public static void main(String[] args) throws SQLException {
        System.out.println("Starting Aurora DSQL Connection Manager with HikariCP and Aurora DSQL JDBC Connector");
        System.out.println();

        // Environment variables for configuration
        String clusterEndpoint = System.getenv("CLUSTER_ENDPOINT");
        String clusterUser = System.getenv("CLUSTER_USER");

        // Validation
        assert clusterUser != null : "CLUSTER_USER environment variable is not set";
        assert clusterEndpoint != null && !clusterEndpoint.isEmpty() : "CLUSTER_ENDPOINT environment variable is not set";

        // Build the JDBC URL
        String url = "jdbc:aws-dsql:postgresql://" + clusterEndpoint + "/postgres?user=" + clusterUser;

        // Initialize the connection manager with Aurora DSQL JDBC Connector
        System.out.println("Initializing Aurora DSQL Connection Manager with HikariCP...");
        System.out.println("Using URL: " + url);
        Example example = new Example(url, clusterUser);
        System.out.println("Connection Manager initialized with Aurora DSQL JDBC Connector!");
        System.out.println("- Automatic IAM authentication enabled");
        System.out.println("- Token management handled by connector");
        System.out.println("- Connection refresh managed automatically");
        System.out.println("- Prepared statement persistence enabled");
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

            // Cleanup test data
            try (Connection conn = example.getConnection()) {
                Statement cleanup = conn.createStatement();
                int deletedRows = cleanup.executeUpdate("DELETE FROM owner WHERE name LIKE '%John Doe%'");
                cleanup.close();

                System.out.println("Cleaned up " + deletedRows + " test records");
            }

        } finally {
            // Graceful shutdown
            System.out.println("Shutting down Connection Manager...");
            // Close connection pool
            if (example.dataSource != null && !example.dataSource.isClosed()) {
                example.dataSource.close();
            }

            System.out.println("Aurora DSQL Connection Manager shutdown completed");
        }

        System.out.println();
        System.out.println("Aurora DSQL Connection Manager with HikariCP and Aurora DSQL JDBC Connector example completed successfully!");
    }

    /**
     * Clean up the sample table
     */
    private static void dropSampleTable(Connection connection) throws SQLException {
        if (connection == null) {
            System.err.println("Connection is null, cannot drop table");
            return;
        }
        
        System.out.println("\n=== Cleaning Up ===");

        try (Statement stmt = connection.createStatement()) {
            if (stmt != null) {
                stmt.execute("DROP TABLE IF EXISTS owner");
                System.out.println("✓ Sample table dropped");
            }
        }
    }
}
