// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

package com.example.dsql.batch_operations;

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
 * Sequential and parallel batch UPDATE for Aurora DSQL.
 */
public class BatchUpdate {

    /** Stop retrying a batch after this many consecutive OCC exhaustions. */
    private static final int MAX_CONSECUTIVE_FAILURES = 10;

    public static int batchUpdate(
            DataSource pool, String table, String setClause, String condition,
            int batchSize, int maxRetries, long baseDelayMs)
            throws SQLException, OccRetry.MaxRetriesExceededException {

        int totalUpdated = 0;
        int consecutiveFailures = 0;
        while (true) {
            try (Connection conn = pool.getConnection()) {
                conn.setAutoCommit(false);
                String sql = "UPDATE " + table + " SET " + setClause + ", updated_at = NOW()"
                        + " WHERE id IN (SELECT id FROM " + table
                        + " WHERE " + condition + " LIMIT " + batchSize + ")";

                int updated = OccRetry.executeWithRetry(conn, (c) -> {
                    try (Statement stmt = c.createStatement()) {
                        return stmt.executeUpdate(sql);
                    }
                }, maxRetries, baseDelayMs);

                conn.commit();
                totalUpdated += updated;
                consecutiveFailures = 0;
                System.out.println("Updated " + updated + " rows (total: " + totalUpdated + ")");
                if (updated == 0) break;
            } catch (OccRetry.MaxRetriesExceededException e) {
                consecutiveFailures++;
                System.out.println("Batch OCC retries exhausted (" + consecutiveFailures
                        + "/" + MAX_CONSECUTIVE_FAILURES + "), retrying batch with fresh connection");
                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) throw e;
            }
        }
        return totalUpdated;
    }

    public static int batchUpdate(DataSource pool, String table, String setClause, String condition)
            throws SQLException, OccRetry.MaxRetriesExceededException {
        return batchUpdate(pool, table, setClause, condition, 1000, 3, 100);
    }

    public static int parallelBatchUpdate(
            DataSource pool, String table, String setClause, String condition,
            int numWorkers, int batchSize, int maxRetries, long baseDelayMs)
            throws SQLException, OccRetry.MaxRetriesExceededException {

        ExecutorService executor = Executors.newFixedThreadPool(numWorkers);
        List<Future<Integer>> futures = new ArrayList<>();

        for (int i = 0; i < numWorkers; i++) {
            final int workerId = i;
            futures.add(executor.submit(() -> {
                int totalUpdated = 0;
                int consecutiveFailures = 0;
                String partitionCondition = condition
                        + " AND abs(hashtext(CAST(id AS text))) % " + numWorkers + " = " + workerId;

                while (true) {
                    try (Connection conn = pool.getConnection()) {
                        conn.setAutoCommit(false);
                        String sql = "UPDATE " + table + " SET " + setClause + ", updated_at = NOW()"
                                + " WHERE id IN (SELECT id FROM " + table
                                + " WHERE " + partitionCondition + " LIMIT " + batchSize + ")";

                        int updated = OccRetry.executeWithRetry(conn, (c) -> {
                            try (Statement stmt = c.createStatement()) {
                                return stmt.executeUpdate(sql);
                            }
                        }, maxRetries, baseDelayMs);

                        conn.commit();
                        totalUpdated += updated;
                        consecutiveFailures = 0;
                        System.out.println("Worker " + workerId + ": Updated " + updated + " rows (total: " + totalUpdated + ")");
                        if (updated == 0) break;
                    } catch (OccRetry.MaxRetriesExceededException e) {
                        consecutiveFailures++;
                        System.out.println("Worker " + workerId + ": Batch OCC retries exhausted ("
                                + consecutiveFailures + "/" + MAX_CONSECUTIVE_FAILURES
                                + "), retrying batch with fresh connection");
                        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) throw e;
                    }
                }
                return totalUpdated;
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
                throw new SQLException("Parallel update interrupted", e);
            }
        }

        System.out.println("Parallel update complete: " + total + " rows updated by " + numWorkers + " workers");
        return total;
    }

    public static int parallelBatchUpdate(DataSource pool, String table, String setClause, String condition)
            throws SQLException, OccRetry.MaxRetriesExceededException {
        return parallelBatchUpdate(pool, table, setClause, condition, 4, 1000, 3, 100);
    }
}
