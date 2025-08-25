package com.amazon.dsql.samples;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * Basic connection example using Aurora DSQL JDBC Connector.
 * This example demonstrates how to connect to Aurora DSQL using the connector
 * with automatic IAM authentication and token management.
 * 
 * Note: For compilation purposes, this uses the standard PostgreSQL driver.
 * In actual usage, you would use "org.postgresql.Driver"
 */
public class BasicConnectionExample {
    
    // Replace with your Aurora DSQL cluster endpoint
    private static final String CLUSTER_ENDPOINT = System.getenv("CLUSTER_ENDPOINT");
    private static final String CLUSTER_USER = System.getenv("CLUSTER_USER");
    private static final String PROFILE = System.getenv("PROFILE");
    
    public static void main(String[] args) {
        System.out.println("Aurora DSQL JDBC Connector - Basic Connection Example");
        assert CLUSTER_ENDPOINT != null : "CLUSTER_ENDPOINT environment variable is not set";
        assert CLUSTER_USER != null : "CLUSTER_USER environment variable is not set";
 
        // Example 1: Connect using jdbc:aws-dsql:postgresql URL
        connectWithAwsDsqlPostgresqlUrl();
        
        // Example 2: Connect with custom token duration
        connectWithCustomTokenDuration();
        
        // Example 3: Connect with AWS profile
        connectWithAwsProfile();
    }

    /**
     * Connect using jdbc:aws-dsql:postgresql:// URL format
     */
    private static void connectWithAwsDsqlPostgresqlUrl() {
        System.out.println("\n=== Example 1: Connect using jdbc:aws-dsql:postgresql:// URL ===");

        String url = "jdbc:aws-dsql:postgresql://" + CLUSTER_ENDPOINT + "/postgres?user=" + CLUSTER_USER;

        try (Connection connection = DriverManager.getConnection(url)) {
            System.out.println("✓ Connected successfully to Aurora DSQL using jdbc:aws-dsql:postgresql:// URL");
            executeSimpleQuery(connection);
        } catch (SQLException e) {
            System.err.println("✗ Connection failed: " + e.getMessage());
            e.printStackTrace();
        }
    }
    
    /**
     * Connect with custom token duration (4 hours instead of default 8 hours)
     */
    private static void connectWithCustomTokenDuration() {
        System.out.println("\n=== Example 2: Connect with Custom Token Duration ===");
        
        String url = "jdbc:aws-dsql:postgresql://" + CLUSTER_ENDPOINT + "/postgres?user=" + CLUSTER_USER + "&token-duration-secs=14400";
        
        try (Connection connection = DriverManager.getConnection(url)) {
            System.out.println("✓ Connected with custom token duration (4 hours)");
            executeSimpleQuery(connection);
        } catch (SQLException e) {
            System.err.println("✗ Connection failed: " + e.getMessage());
            e.printStackTrace();
        }
    }
    
    /**
     * Connect using a specific AWS profile
     */
    private static void connectWithAwsProfile() {
        System.out.println("\n=== Example 3: Connect with AWS Profile ===");
        
        if (PROFILE == null || PROFILE.isEmpty()) {
            System.out.println("Skipping AWS profile example - PROFILE environment variable not set");
            return;
        }
        
        String url = "jdbc:aws-dsql:postgresql://" + CLUSTER_ENDPOINT + "/postgres?user=" + CLUSTER_USER + "&profile=" + PROFILE;
        
        try (Connection connection = DriverManager.getConnection(url)) {
            System.out.println("✓ Connected using AWS profile: " + PROFILE);
            executeSimpleQuery(connection);
        } catch (SQLException e) {
            System.err.println("✗ Connection failed: " + e.getMessage());
            e.printStackTrace();
        }
    }
    
    /**
     * Execute a simple query to verify the connection
     */
    private static void executeSimpleQuery(Connection connection) {
        if (connection == null) {
            System.err.println("Connection is null, cannot execute query");
            return;
        }
        
        try (Statement stmt = connection.createStatement();
             ResultSet rs = stmt.executeQuery("SELECT version()")) {
            
            if (rs != null && rs.next()) {
                String version = rs.getString(1);
                if (version != null) {
                    System.out.println("Database version: " + version);
                }
            }
            
            // Test current timestamp
            try (ResultSet rs2 = stmt.executeQuery("SELECT current_timestamp")) {
                if (rs2 != null && rs2.next()) {
                    System.out.println("Current timestamp: " + rs2.getTimestamp(1));
                }
            }
            
        } catch (SQLException e) {
            System.err.println("Query execution failed: " + e.getMessage());
        }
    }
}
