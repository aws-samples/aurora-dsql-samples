package com.amazon.dsql.samples;

import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.ProfileCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sts.StsClient;
import software.amazon.awssdk.services.sts.auth.StsAssumeRoleCredentialsProvider;
import software.amazon.awssdk.services.sts.model.AssumeRoleRequest;
import software.amazon.dsql.jdbc.AuroraDsqlCredentialsManager;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * Custom AWS Credentials Provider example using Aurora DSQL JDBC Connector.
 * This example demonstrates how to use different AWS credential providers
 * with the Aurora DSQL JDBC Connector.
 */
public class CustomCredentialsProviderExample {
    
    // Read configuration from environment variables
    private static final String CLUSTER_ENDPOINT = System.getenv("CLUSTER_ENDPOINT");
    private static final String CLUSTER_USER = System.getenv("CLUSTER_USER");
    private static final String PROFILE = System.getenv("PROFILE");
    private static final String ROLE_ARN = System.getenv("ROLE_ARN");
    
    public static void main(String[] args) {
        System.out.println("Aurora DSQL JDBC Connector - Custom Credentials Provider Example");
        
        // Verify environment variables are set
        assert CLUSTER_ENDPOINT != null : "CLUSTER_ENDPOINT environment variable is not set";
        assert CLUSTER_USER != null : "CLUSTER_USER environment variable is not set";
        
        // Example 1: Using Profile Credentials Provider
        connectWithProfileCredentials();
        
        // Example 2: Using STS Assume Role Credentials Provider
        connectWithAssumeRoleCredentials();
    }
    
    /**
     * Connect using a specific AWS profile
     */
    private static void connectWithProfileCredentials() {
        System.out.println("\n=== Example 1: Profile Credentials Provider ===");
        
        try {
            // Verify environment variables are set
            assert CLUSTER_ENDPOINT != null : "CLUSTER_ENDPOINT environment variable is not set";
            assert CLUSTER_USER != null : "CLUSTER_USER environment variable is not set";
            
            // Create profile credentials provider
            AwsCredentialsProvider profileCredentials = ProfileCredentialsProvider.builder()
                    .profileName(PROFILE != null ? PROFILE : "default") // Use environment variable or default
                    .build();
            
            // Set the custom credentials provider
            AuroraDsqlCredentialsManager.setProvider(profileCredentials);
            
            // Connect to Aurora DSQL using URL with profile parameter
            String url = "jdbc:aws-dsql:postgresql://" + CLUSTER_ENDPOINT + "/postgres?user=" + CLUSTER_USER;
            if (PROFILE != null && !PROFILE.isEmpty()) {
                url += "&profile=" + PROFILE;
            }
            
            try (Connection connection = DriverManager.getConnection(url)) {
                System.out.println("✓ Connected using profile credentials");
                executeSimpleQuery(connection);
            }
            
        } catch (Exception e) {
            System.err.println("✗ Profile credentials connection failed: " + e.getMessage());
            e.printStackTrace();
        }
    }
    
    /**
     * Connect using STS Assume Role credentials
     */
    private static void connectWithAssumeRoleCredentials() {
        System.out.println("\n=== Example 2: STS Assume Role Credentials Provider ===");
        
        try {
            // Verify environment variables are set
            assert CLUSTER_ENDPOINT != null : "CLUSTER_ENDPOINT environment variable is not set";
            assert CLUSTER_USER != null : "CLUSTER_USER environment variable is not set";
            
            if (ROLE_ARN == null || ROLE_ARN.isEmpty()) {
                System.out.println("Skipping assume role example - ROLE_ARN environment variable not set");
                return;
            }
            
            System.out.println("Using role ARN: " + ROLE_ARN);
            
            // Create STS client - extract region from cluster endpoint
            String region = extractRegionFromEndpoint(CLUSTER_ENDPOINT);
            StsClient stsClient = StsClient.builder()
                    .region(Region.of(region))
                    .build();
            
            // Create assume role credentials provider
            AwsCredentialsProvider assumeRoleCredentials = StsAssumeRoleCredentialsProvider.builder()
                    .refreshRequest(
                            AssumeRoleRequest.builder()
                                    .roleArn(ROLE_ARN)
                                    .roleSessionName("aurora-dsql-session")
                                    .durationSeconds(3600) // 1 hour
                                    .build()
                    )
                    .stsClient(stsClient)
                    .build();
            
            // Set the custom credentials provider
            AuroraDsqlCredentialsManager.setProvider(assumeRoleCredentials);
            
            // Connect to Aurora DSQL using URL
            String url = "jdbc:aws-dsql:postgresql://" + CLUSTER_ENDPOINT + "/postgres?user=" + CLUSTER_USER;
            
            try (Connection connection = DriverManager.getConnection(url)) {
                System.out.println("✓ Connected using assume role credentials");
                executeSimpleQuery(connection);
            }
            
        } catch (Exception e) {
            System.err.println("✗ Assume role credentials connection failed: " + e.getMessage());
            e.printStackTrace();
        }
    }
    
    /**
     * Extract region from Aurora DSQL endpoint
     */
    private static String extractRegionFromEndpoint(String endpoint) {
        if (endpoint == null || endpoint.isEmpty()) {
            return "us-east-1"; // default fallback
        }
        
        // Extract region from endpoint like: cluster-id.dsql.us-east-1.on.aws
        String[] parts = endpoint.split("\\.");
        if (parts.length >= 3 && parts[2] != null) {
            return parts[2]; // us-east-1
        }
        return "us-east-1"; // default fallback
    }
    
    /**
     * Execute a simple query to verify the connection
     */
     private static void executeSimpleQuery(Connection connection) {
        if (connection == null) {
            System.err.println("Connection is null, cannot execute query");
            return;
        }
        
        try (Statement stmt = connection.createStatement()) {
            
            // Test current user
            try (ResultSet rs = stmt.executeQuery("SELECT current_user")) {
                if (rs != null && rs.next()) {
                    String currentUser = rs.getString(1);
                    if (currentUser != null) {
                        System.out.println("Current user: " + currentUser);
                    }
                }
            }
            
            // Test current database
            try (ResultSet rs = stmt.executeQuery("SELECT current_database()")) {
                if (rs != null && rs.next()) {
                    String currentDb = rs.getString(1);
                    if (currentDb != null) {
                        System.out.println("Current database: " + currentDb);
                    }
                }
            }
            
            // Test current timestamp
            try (ResultSet rs = stmt.executeQuery("SELECT current_timestamp")) {
                if (rs != null && rs.next()) {
                    System.out.println("Current timestamp: " + rs.getTimestamp(1));
                }
            }
            
        } catch (SQLException e) {
            System.err.println("Query execution failed: " + e.getMessage());
        }
    }
}
