// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

package com.example.dsql;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import javax.sql.DataSource;

/**
 * Sequential and parallel batch DELETE for Aurora DSQL.
 */
public class BatchDelete {

    public static int batchDelete(
            DataSource pool, String table, String condition,
            int batchSize, int maxRetries, double baseDelay)
            throws SQLException, OccRetry.MaxRetriesExceededException {

        int totalDeleted = 0;
        while (true) {
            try (Connection conn = pool.getConnection()) {
                conn.setAutoCommit(false);
                String sql = "DELETE FROM " + table + " WHERE id IN (SELECT id FROM " + table
                        + " WHERE " + condition + " LIMIT " + batchSize + ")";

                int deleted = OccRetry.executeWithRetry(conn, (c) -> {
                    try (Statement stmt = c.createStatement()) {
                        return stmt.executeUpdate(sql);
                    }
                }, maxRetries, baseDelay);

                conn.commit();
                totalDeleted += deleted;
                System.out.println("Deleted " + deleted + " rows (total: " + totalDeleted + ")");
                if (deleted == 0) break;
            }
        }
        return totalDeleted;
    }

    public static int batchDelete(DataSource pool, String table, String condition)
            throws SQLException, OccRetry.MaxRetriesExceededException {
        return batchDelete(pool, table, condition, 1000, 3, 0.1);
    }

    public static int parallelBatchDelete(
            DataSource pool, String table, String condition,
            int numWorkers, int batchSize, int maxRetries, double baseDelay)
            throws SQLException, OccRetry.MaxRetriesExceededException {

        ExecutorService executor = Executors.newFixedThreadPool(numWorkers);
        List<Future<Integer>> futures = new ArrayList<>();

        for (int i = 0; i < numWorkers; i++) {
            final int workerId = i;
            futures.add(executor.submit(() -> {
                int totalDeleted = 0;
                String partitionCondition = condition
                        + " AND abs(hashtext(CAST(id AS text))) % " + numWorkers + " = " + workerId;

                while (true) {
                    try (Connection conn = pool.getConnection()) {
                        conn.setAutoCommit(false);
                        String sql = "DELETE FROM " + table + " WHERE id IN (SELECT id FROM " + table
                                + " WHERE " + partitionCondition + " LIMIT " + batchSize + ")";

                        int deleted = OccRetry.executeWithRetry(conn, (c) -> {
                            try (Statement stmt = c.createStatement()) {
                                return stmt.executeUpdate(sql);
                            }
                        }, maxRetries, baseDelay);

                        conn.commit();
                        totalDeleted += deleted;
                        System.out.println("Worker " + workerId + ": Deleted " + deleted + " rows (total: " + totalDeleted + ")");
                        if (deleted == 0) break;
                    }
                }
                return totalDeleted;
            }));
        }

        executor.shutdown();
        int total = 0;
        for (Future<Integer> future : futures) {
            try {
                total += future.get();
            } catch (ExecutionException e) {
                Throwable cause = e.getCause();
                if (cause instanceof SQLException) throw (SQLException) cause;
                if (cause instanceof OccRetry.MaxRetriesExceededException) throw (OccRetry.MaxRetriesExceededException) cause;
                throw new SQLException("Worker thread failed", cause);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new SQLException("Parallel delete interrupted", e);
            }
        }

        System.out.println("Parallel delete complete: " + total + " rows deleted by " + numWorkers + " workers");
        return total;
    }

    public static int parallelBatchDelete(DataSource pool, String table, String condition)
            throws SQLException, OccRetry.MaxRetriesExceededException {
        return parallelBatchDelete(pool, table, condition, 4, 1000, 3, 0.1);
    }
}
