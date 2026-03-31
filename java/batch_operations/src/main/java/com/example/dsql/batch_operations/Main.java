// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

package com.example.dsql.batch_operations;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;
import javax.sql.DataSource;

/**
 * Main entry point for Aurora DSQL batch operations demo (Java).
 *
 * Uses HikariCP with the Aurora DSQL JDBC Connector for automatic
 * IAM authentication and connection pooling.
 *
 * Usage:
 *   gradle run --args="--endpoint &lt;cluster-endpoint&gt; [--user admin]
 *              [--batch-size 1000] [--num-workers 4]"
 */
public class Main {

    @FunctionalInterface
    interface BatchOperation {
        int run() throws SQLException, OccRetry.MaxRetriesExceededException;
    }

    private static int runOperation(String label, BatchOperation op)
            throws SQLException, OccRetry.MaxRetriesExceededException {
        System.out.println();
        System.out.println("=".repeat(60));
        System.out.println("  " + label);
        System.out.println("=".repeat(60));
        long start = System.currentTimeMillis();
        int total = op.run();
        double elapsed = (System.currentTimeMillis() - start) / 1000.0;
        System.out.printf("%n  Summary: %d rows affected in %.2fs%n", total, elapsed);
        System.out.println("=".repeat(60));
        return total;
    }

    /**
     * Create a HikariCP DataSource configured for Aurora DSQL with automatic
     * IAM authentication via the Aurora DSQL JDBC Connector.
     */
    private static HikariDataSource createDataSource(String endpoint, String user, int numWorkers) {
        String jdbcUrl = "jdbc:aws-dsql:postgresql://" + endpoint;

        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(jdbcUrl);
        config.setUsername(user);

        // Pool sized for parallel workers
        config.setPoolName("BatchOpsPool");
        config.setMaximumPoolSize(numWorkers);
        config.setMinimumIdle(1);
        config.setConnectionTimeout(30000);
        config.setMaxLifetime(3300000);  // 55 min (connector handles token refresh)
        config.setConnectionTestQuery("SELECT 1");
        config.setAutoCommit(true);

        return new HikariDataSource(config);
    }

    private static Map<String, String> parseArgs(String[] args) {
        Map<String, String> config = new HashMap<>();
        config.put("user", "admin");
        config.put("batch-size", "1000");
        config.put("num-workers", "4");

        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--endpoint": config.put("endpoint", args[++i]); break;
                case "--user": config.put("user", args[++i]); break;
                case "--batch-size": config.put("batch-size", args[++i]); break;
                case "--num-workers": config.put("num-workers", args[++i]); break;
                default:
                    System.err.println("Unknown argument: " + args[i]);
                    System.exit(1);
            }
        }
        if (!config.containsKey("endpoint")) {
            System.err.println("Usage: gradle run --args=\"--endpoint <cluster-endpoint> "
                    + "[--user admin] [--batch-size 1000] [--num-workers 4]\"");
            System.exit(1);
        }
        return config;
    }

    public static void main(String[] args) {
        Map<String, String> config = parseArgs(args);
        String endpoint = config.get("endpoint");
        String user = config.get("user");
        int batchSize = Integer.parseInt(config.get("batch-size"));
        int numWorkers = Integer.parseInt(config.get("num-workers"));

        HikariDataSource pool = createDataSource(endpoint, user, numWorkers);
        String table = "batch_test";

        try {
            runOperation("Sequential Batch DELETE (category = 'electronics')",
                () -> BatchDelete.batchDelete(pool, table, "category = 'electronics'", batchSize, 3, 100));

            runOperation("Sequential Batch UPDATE (clothing -> processed)",
                () -> BatchUpdate.batchUpdate(pool, table, "status = 'processed'",
                    "category = 'clothing' AND status != 'processed'", batchSize, 3, 100));

            runOperation("Parallel Batch DELETE (category = 'food') [" + numWorkers + " workers]",
                () -> BatchDelete.parallelBatchDelete(pool, table, "category = 'food'", numWorkers, batchSize, 3, 100));

            runOperation("Parallel Batch UPDATE (books -> archived) [" + numWorkers + " workers]",
                () -> BatchUpdate.parallelBatchUpdate(pool, table, "status = 'archived'",
                    "category = 'books' AND status != 'archived'", numWorkers, batchSize, 3, 100));

        } catch (SQLException e) {
            System.err.println("Database error: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        } catch (OccRetry.MaxRetriesExceededException e) {
            System.err.println("Max retries exceeded: " + e.getMessage());
            System.exit(1);
        } finally {
            pool.close();
        }
        System.out.println("\nDemo complete.");
    }
}
