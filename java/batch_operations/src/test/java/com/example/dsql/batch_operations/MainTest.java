// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

package com.example.dsql.batch_operations;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainTest {

    private static String extractRegion(String endpoint) {
        Matcher m = Pattern.compile("\\.dsql\\.([^.]+)\\.on\\.aws").matcher(endpoint);
        assertTrue(m.find(), "Cannot extract region from endpoint: " + endpoint);
        return m.group(1);
    }

    @BeforeAll
    static void seedDatabase() throws Exception {
        String endpoint = System.getenv("CLUSTER_ENDPOINT");
        assertNotNull(endpoint, "CLUSTER_ENDPOINT environment variable is required");
        String user = System.getenv().getOrDefault("CLUSTER_USER", "admin");
        String region = extractRegion(endpoint);

        // Generate auth token
        Process tokenProc = new ProcessBuilder(
                "aws", "dsql", "generate-db-connect-admin-auth-token",
                "--hostname", endpoint, "--region", region, "--expires-in", "3600"
        ).redirectErrorStream(true).start();
        String token = new String(tokenProc.getInputStream().readAllBytes()).trim();
        assertEquals(0, tokenProc.waitFor(), "Failed to generate auth token");

        // Run setup SQL via psql
        ProcessBuilder pb = new ProcessBuilder(
                "psql",
                "host=" + endpoint + " dbname=postgres user=" + user + " sslmode=verify-full sslrootcert=system connect_timeout=10",
                "-f", "batch_test_setup.sql"
        );
        Map<String, String> env = pb.environment();
        env.put("PGPASSWORD", token);
        pb.inheritIO();
        Process psql = pb.start();
        assertEquals(0, psql.waitFor(), "psql batch_test_setup.sql failed");
    }

    @Test
    public void testBatchOperations() {
        assertAll(() -> Main.main(new String[]{
            "--endpoint", System.getenv("CLUSTER_ENDPOINT"),
            "--user", System.getenv().getOrDefault("CLUSTER_USER", "admin")
        }));
    }
}
