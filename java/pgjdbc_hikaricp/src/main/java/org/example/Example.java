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
 * 
 * This implementation provides:
 * - HikariCP connection pooling optimized for Aurora DSQL using PostgreSQL DataSource
 * - Dynamic auth token generation via custom getCredentials method
 * - Connection Management: Automatically handles connection lifecycle
 * - Monitoring: Built-in metrics and leak detection
 * - Configuration: Extensive tuning options for optimal performance
 * - Thread-safe singleton pattern with graceful shutdown
 * - Production-ready configuration with connection validation
 * - Direct PostgreSQL DataSource configuration with custom credential provider
 */
public class Example {

    private static volatile Example instance;
    private static final Object lock = new Object();
    
    private HikariDataSource dataSource;
    private CustomPGDataSource pgDataSource;
    private DsqlUtilities dsqlUtilities;
    private String endpoint;
    private String user;
    private String region;

    private Example(String endpoint, String user, String region) {
        this.endpoint = endpoint;
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
        // Password will be provided dynamically via getConnections method
        
        // PostgreSQL SSL configuration for Aurora DSQL
        this.pgDataSource.setSslMode("verify-full");
        // Note: SSL factory and negotiation are set via connection properties in HikariCP config
        
        // Initialize connection pool
        initializeConnectionPool(this.user);
    }

    /**
     * Initialize the connection manager singleton
     */
    public static void initialize(String endpoint, String user, String region) {
        if (instance == null) {
            synchronized (lock) {
                if (instance == null) {
                    instance = new Example(endpoint, user, region);
                }
            }
        }
    }

    /**
     * Get the singleton instance
     */
    private static Example getInstance() {
        if (instance == null) {
            throw new IllegalStateException("Connection manager not initialized. Call initialize() first.");
        }
        return instance;
    }

    private void initializeConnectionPool(String username) {
        
        // Configure HikariCP with the PostgreSQL DataSource
        HikariConfig config = new HikariConfig();
        config.setDataSource(this.pgDataSource);
        
        // Additional SSL properties via HikariCP
        config.addDataSourceProperty("sslfactory", "org.postgresql.ssl.DefaultJavaSSLFactory");
        config.addDataSourceProperty("sslNegotiation", "direct");
        
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
        
        // Performance optimizations
        config.setAutoCommit(true);
        config.setReadOnly(false);
        if (!username.equals("admin")) {
          config.setSchema("myschema");
        }

        // Monitoring
        config.setRegisterMbeans(true);
        
        this.dataSource = new HikariDataSource(config);
    }

    /**
     * Generate a fresh authentication token for Aurora DSQL
     */
    private String generateAuthToken(String url, String user, int port) {
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
            return endpoint;
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
        }
        return url;
    }

    /**
     * Custom PostgreSQL DataSource that provides dynamic token generation
     */
    private class CustomPGDataSource extends PGSimpleDataSource {
        @Override
        public Connection getConnection() throws SQLException {
            // Generate fresh token for each connection request
            String token = generateAuthToken(getUrl(), getUser(), getPortNumber());
            return super.getConnection(getUser(), token);
        }
        
        @Override
        public Connection getConnection(String username, String password) throws SQLException {
            // If specific credentials are provided, use them
            if (password != null && !password.isEmpty()) {
                return super.getConnection(username, password);
            }
            // Otherwise generate a fresh token
            String token = generateAuthToken(getUrl(), username, getPortNumber());
            return super.getConnection(username, token);
        }
    }

    /**
     * Get a connection from the managed pool
     */
    public static Connection getConnection() throws SQLException {
        return getInstance().dataSource.getConnection();
    }

    /**
     * Get connection pool statistics
     */
    public static String getPoolStats() {
        if (instance == null) {
            return "Connection manager not initialized";
        }
        
        var pool = instance.dataSource.getHikariPoolMXBean();
        return String.format("Pool Stats - Total: %d, Active: %d, Idle: %d, Waiting: %d",
                pool.getTotalConnections(),
                pool.getActiveConnections(),
                pool.getIdleConnections(),
                pool.getThreadsAwaitingConnection());
    }

    /**
     * Check if the connection pool is healthy
     */
    public static boolean isHealthy() {
        if (instance == null) {
            return false;
        }
        
        try (Connection conn = instance.dataSource.getConnection()) {
            return conn.isValid(5); // 5 second timeout
        } catch (SQLException e) {
            return false;
        }
    }

    /**
     * Shutdown the connection manager
     */
    public static void shutdown() {
        if (instance != null) {
            synchronized (lock) {
                if (instance != null) {
                    instance.shutdownInternal();
                    instance = null;
                }
            }
        }
    }

    private void shutdownInternal() {
        // Close connection pool
        if (dataSource != null && !dataSource.isClosed()) {
            dataSource.close();
        }
        
        System.out.println("Aurora DSQL Connection Manager shutdown completed");
    }

    public static void main(String[] args) throws SQLException, InterruptedException {
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
        initialize(clusterEndpoint, clusterUser, region);
        System.out.println("Connection Manager initialized with dynamic token generation!");
        System.out.println(getPoolStats());
        System.out.println();
        
        try {
            // Test basic connectivity
            testBasicConnectivity(clusterUser);
            
            // Demonstrate connection pooling with multiple concurrent connections
            System.out.println("Testing connection pool with multiple connections...");
            
            try (Connection conn1 = getConnection()) {
                System.out.println("Connection 1 obtained from pool");
                executeExample(conn1, clusterUser, 1);
            }
            
            try (Connection conn2 = getConnection()) {
                System.out.println("Connection 2 obtained from pool");
                executeExample(conn2, clusterUser, 2);
            }
            
            try (Connection conn3 = getConnection()) {
                System.out.println("Connection 3 obtained from pool");
                executeExample(conn3, clusterUser, 3);
            }
            
            // Monitor pool health and statistics
            monitorPoolHealth(clusterUser);
            
            // Display final statistics
            System.out.println("Final Pool Statistics:");
            System.out.println(getPoolStats());
            System.out.println("Health Status: " + (isHealthy() ? "Healthy" : "Unhealthy"));
            
        } finally {
            // Graceful shutdown
            System.out.println("Shutting down Connection Manager...");
            shutdown();
        }
        
        System.out.println();
        System.out.println("Aurora DSQL Connection Manager with Dynamic Token Generation example completed successfully!");
    }
    
    private static void testBasicConnectivity(String clusterUser) throws SQLException {
        System.out.println("Testing basic connectivity with dynamic token generation...");
        
        try (Connection conn = getConnection()) {
            // Test basic query
            Statement test = conn.createStatement();
            ResultSet rs = test.executeQuery("SELECT 1 as test_value");
            if (rs.next()) {
                System.out.println("Basic connectivity test passed! Test value: " + rs.getInt("test_value"));
            }
            rs.close();
            test.close();
            
            System.out.println(getPoolStats());
        }
        System.out.println();
    }
    
    private static void monitorPoolHealth(String clusterUser) throws SQLException {
        System.out.println("Monitoring pool health...");
        
        // Check pool health
        boolean isHealthy = isHealthy();
        System.out.println("Health Status: " + (isHealthy ? "Healthy" : "Unhealthy"));
        
        // Get detailed stats
        System.out.println(getPoolStats());
        
        // Cleanup test data
        try (Connection conn = getConnection()) {
            // Set schema for non-admin users
            if (!clusterUser.equals("admin")) {
                Statement setSchema = conn.createStatement();
                setSchema.execute("SET search_path=myschema");
                setSchema.close();
            }
            
            Statement cleanup = conn.createStatement();
            int deletedRows = cleanup.executeUpdate("DELETE FROM owner WHERE name LIKE '%John Doe%'");
            cleanup.close();
            
            System.out.println("Cleaned up " + deletedRows + " test records");
        }
        
        System.out.println("Pool health monitoring completed!");
        System.out.println();
    }
    
    private static void executeExample(Connection conn, String clusterUser, int connectionNumber) throws SQLException {
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
}
