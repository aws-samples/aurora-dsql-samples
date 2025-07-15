package org.example;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.postgresql.ds.PGSimpleDataSource;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.services.dsql.DsqlUtilities;
import software.amazon.awssdk.services.dsql.model.GenerateAuthTokenRequest;
import software.amazon.awssdk.regions.Region;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * Aurora DSQL Connection Manager with Dynamic Token Refresh
 * <p>
 * This implementation provides:
 * <ul>
 * <li>HikariCP connection pooling optimized for Aurora DSQL using PostgreSQL DataSource</li>
 * <li>Dynamic auth token generation via custom getConnection method</li>
 * <li>Connection Management: Automatically handles connection lifecycle</li>
 * <li>Monitoring: Built-in metrics and leak detection</li>
 * <li>Configuration: Extensive tuning options for optimal performance</li>
 * <li>Thread-safe singleton pattern with graceful shutdown</li>
 * <li>Production-ready configuration with connection validation</li>
 * <li>Direct PostgreSQL DataSource configuration with custom credential provider</li>
 * </ul>
 */
public class Example {

    private final HikariDataSource dataSource;
    private final CustomPGDataSource pgDataSource;
    private final DsqlUtilities dsqlUtilities;
    private final String user;
    private final String region;

    public Example(String endpoint, String user, String region) {
        this.user = user;
        this.region = region;

        // Initialize AWS DSQL utilities
        this.dsqlUtilities = DsqlUtilities.builder()
                .region(Region.of(region))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();

        this.pgDataSource = new CustomPGDataSource();
        this.pgDataSource.setServerNames(new String[]{endpoint});
        this.pgDataSource.setPortNumbers(new int[]{5432});
        this.pgDataSource.setDatabaseName("postgres");
        this.pgDataSource.setUser(user);
        // Password will be provided dynamically via getConnection method

        // PostgreSQL SSL configuration for Aurora DSQL
        this.pgDataSource.setSslMode("verify-full");
        // Use the DefaultJavaSSLFactory so that Java's default trust store can be used
        // to verify the server's root cert.
        this.pgDataSource.setSslfactory("org.postgresql.ssl.DefaultJavaSSLFactory");
        this.pgDataSource.setSslNegotiation("direct");

        this.dataSource = initializeConnectionPool(this.user);
    }

    private HikariDataSource initializeConnectionPool(String username) {



        // Configure HikariCP with the PostgreSQL DataSource
        HikariConfig config = new HikariConfig();
        config.setDataSource(this.pgDataSource);

        // HikariCP pool configuration optimized for Aurora DSQL
        config.setPoolName("AuroraDSQLPool");
        config.setMaximumPoolSize(20);                    // Production pool size
        config.setMinimumIdle(5);                         // Keep connections ready
        config.setConnectionTimeout(30000);               // 30 seconds
        config.setIdleTimeout(300000);                    // 5 minutes (shorter than token expiry)
        config.setMaxLifetime(600000);                    // 10 minutes (shorter than token expiry)
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
     * Generate a fresh authentication token for Aurora DSQL
     */
    private String generateAuthToken(String url, String user) {
        GenerateAuthTokenRequest tokenGenerator = GenerateAuthTokenRequest.builder()
                .hostname(extractHostname(url))
                .region(Region.of(region))
                .build();

        if (user.equals("admin")) {
            return dsqlUtilities.generateDbConnectAdminAuthToken(tokenGenerator);
        } else {
            return dsqlUtilities.generateDbConnectAuthToken(tokenGenerator);
        }
    }

    /**
     * Extract hostname from URL
     */
    private String extractHostname(String url) {
        if (url == null) {
            throw new IllegalArgumentException("URL cannot be null");
        }
        // Handle both JDBC URLs and plain hostnames
        if (url.startsWith("jdbc:postgresql://")) {
            String withoutProtocol = url.substring("jdbc:postgresql://".length());
            int colonIndex = withoutProtocol.indexOf(':');
            int slashIndex = withoutProtocol.indexOf('/');

            if (colonIndex > 0 && (slashIndex == -1 || colonIndex < slashIndex)) {
                return withoutProtocol.substring(0, colonIndex);
            } else if (slashIndex > 0) {
                return withoutProtocol.substring(0, slashIndex);
            } else {
                return withoutProtocol;
            }
        } else {
            throw new IllegalArgumentException("Invalid URL expected url should contain jdbc:postgresql://");
        }
    }

    /**
     * Custom PostgreSQL DataSource that provides dynamic token generation
     */
    private class CustomPGDataSource extends PGSimpleDataSource {
        /**
         * Override connection to obtain a token for each connection
         * @return new connection for Hikari pool with updated token
         * @throws SQLException
         */
        @Override
        public Connection getConnection() throws SQLException {
            // Generate fresh token for each connection request
            String token = generateAuthToken(getUrl(), getUser());
            return super.getConnection(getUser(), token);
        }

        /**
         * Override connection to obtain a token for each connection
         * @return new connection for Hikari pool with updated token
         * @throws SQLException
         */
        @Override
        public Connection getConnection(String username, String password) throws SQLException {
            // If specific credentials are provided, use them
            if (password != null && !password.isEmpty()) {
                return super.getConnection(username, password);
            }
            // Otherwise generate a fresh token
            String token = generateAuthToken(getUrl(), username);
            return super.getConnection(username, token);
        }
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
        System.out.println("Starting Aurora DSQL Connection Manager with Dynamic Token Generation");
        System.out.println();

        String clusterEndpoint = System.getenv("CLUSTER_ENDPOINT");
        assert clusterEndpoint != null : "CLUSTER_ENDPOINT environment variable is not set";

        String clusterUser = System.getenv("CLUSTER_USER");
        assert clusterUser != null : "CLUSTER_USER environment variable is not set";

        String region = System.getenv("REGION");
        assert region != null : "REGION environment variable is not set";

        // Initialize the connection manager with dynamic token generation
        System.out.println("Initializing Aurora DSQL Connection Manager...");
        Example example = new Example(clusterEndpoint, clusterUser, region);
        System.out.println("Connection Manager initialized with dynamic token generation!");
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
            System.out.println("Shutting down Connection Manager...");
            // Close connection pool
            if (example.dataSource != null && !example.dataSource.isClosed()) {
                example.dataSource.close();
            }

            System.out.println("Aurora DSQL Connection Manager shutdown completed");
        }

        System.out.println();
        System.out.println("Aurora DSQL Connection Manager with Dynamic Token Generation example completed successfully!");
    }
}
