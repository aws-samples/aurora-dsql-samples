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
import java.util.logging.Logger;
import javax.sql.DataSource;

/**
 * Sequential and parallel batch DELETE for Aurora DSQL.
 *
 * <p>NOTE: The {@code table} and {@code condition} parameters are interpolated
 * directly into SQL. They must come from trusted, developer-controlled sources —
 * never from end-user input. Use parameterized queries for user-supplied values
 * within conditions.</p>
 */
public class BatchDelete {

    private static final Logger logger = Logger.getLogger(BatchDelete.class.getName());

    /** Stop retrying a batch after this many consecutive OCC exhaustions. */
    private static final int MAX_CONSECUTIVE_FAILURES = 10;

    /**
     * Thrown when rows still match the condition after a batch operation completes.
     */
    public static class IncompleteBatchException extends SQLException {
        private final int remaining;
        private final int totalAffected;

        public IncompleteBatchException(int remaining, int totalAffected) {
            super(remaining + " rows still match condition after deleting " + totalAffected + " rows");
            this.remaining = remaining;
            this.totalAffected = totalAffected;
        }

        public int getRemaining() { return remaining; }
        public int getTotalAffected() { return totalAffected; }
    }

    public static int batchDelete(
            DataSource pool, String table, String condition,
            int batchSize, int maxRetries, long baseDelayMs)
            throws SQLException, OccRetry.MaxRetriesExceededException {

        if (batchSize < 1) throw new IllegalArgumentException("batchSize must be >= 1");

        int totalDeleted = 0;
        int consecutiveFailures = 0;
        while (true) {
            try (Connection conn = pool.getConnection()) {
                conn.setAutoCommit(false);
                String sql = "DELETE FROM " + table + " WHERE id IN (SELECT id FROM " + table
                        + " WHERE " + condition + " LIMIT " + batchSize + ")";

                // Commit is inside the retry scope so commit-time 40001 is retried.
                int deleted = OccRetry.executeWithRetry(conn, (c) -> {
                    try (Statement stmt = c.createStatement()) {
                        int count = stmt.executeUpdate(sql);
                        c.commit();
                        return count;
                    }
                }, maxRetries, baseDelayMs);

                totalDeleted += deleted;
                consecutiveFailures = 0;
                logger.info("Deleted " + deleted + " rows (total: " + totalDeleted + ")");
                if (deleted == 0) break;
            } catch (OccRetry.MaxRetriesExceededException e) {
                consecutiveFailures++;
                logger.warning("Batch OCC retries exhausted (" + consecutiveFailures
                        + "/" + MAX_CONSECUTIVE_FAILURES + "), retrying batch with fresh connection");
                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) throw e;
            }
        }

        // Post-verification: ensure no matching rows remain
        try (Connection conn = pool.getConnection();
             Statement stmt = conn.createStatement();
             var rs = stmt.executeQuery("SELECT COUNT(*) FROM " + table + " WHERE " + condition)) {
            if (rs.next()) {
                int remaining = rs.getInt(1);
                if (remaining > 0) {
                    throw new IncompleteBatchException(remaining, totalDeleted);
                }
            }
        }

        return totalDeleted;
    }

    public static int batchDelete(DataSource pool, String table, String condition)
            throws SQLException, OccRetry.MaxRetriesExceededException {
        return batchDelete(pool, table, condition, 1000, 3, 100);
    }

    public static int parallelBatchDelete(
            DataSource pool, String table, String condition,
            int numWorkers, int batchSize, int maxRetries, long baseDelayMs)
            throws SQLException, OccRetry.MaxRetriesExceededException {

        if (numWorkers < 1) throw new IllegalArgumentException("numWorkers must be >= 1");
        if (batchSize < 1) throw new IllegalArgumentException("batchSize must be >= 1");

        ExecutorService executor = Executors.newFixedThreadPool(numWorkers);
        List<Future<Integer>> futures = new ArrayList<>();

        for (int i = 0; i < numWorkers; i++) {
            final int workerId = i;
            futures.add(executor.submit(() -> {
                int totalDeleted = 0;
                int consecutiveFailures = 0;
                // Cast hashtext to bigint before abs() to prevent overflow on INT_MIN.
                String partitionCondition = "(" + condition + ")"
                        + " AND abs(hashtext(CAST(id AS text))::bigint) % " + numWorkers + " = " + workerId;

                while (true) {
                    try (Connection conn = pool.getConnection()) {
                        conn.setAutoCommit(false);
                        String sql = "DELETE FROM " + table + " WHERE id IN (SELECT id FROM " + table
                                + " WHERE " + partitionCondition + " LIMIT " + batchSize + ")";

                        // Commit inside retry scope.
                        int deleted = OccRetry.executeWithRetry(conn, (c) -> {
                            try (Statement stmt = c.createStatement()) {
                                int count = stmt.executeUpdate(sql);
                                c.commit();
                                return count;
                            }
                        }, maxRetries, baseDelayMs);

                        totalDeleted += deleted;
                        consecutiveFailures = 0;
                        logger.info("Worker " + workerId + ": Deleted " + deleted + " rows (total: " + totalDeleted + ")");
                        if (deleted == 0) break;
                    } catch (OccRetry.MaxRetriesExceededException e) {
                        consecutiveFailures++;
                        logger.warning("Worker " + workerId + ": Batch OCC retries exhausted ("
                                + consecutiveFailures + "/" + MAX_CONSECUTIVE_FAILURES
                                + "), retrying batch with fresh connection");
                        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) throw e;
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

        logger.info("Parallel delete complete: " + total + " rows deleted by " + numWorkers + " workers");

        // Post-verification: ensure no matching rows remain (uses original condition, not partitioned)
        try (Connection conn = pool.getConnection();
             Statement stmt = conn.createStatement();
             var rs = stmt.executeQuery("SELECT COUNT(*) FROM " + table + " WHERE " + condition)) {
            if (rs.next()) {
                int remaining = rs.getInt(1);
                if (remaining > 0) {
                    throw new IncompleteBatchException(remaining, total);
                }
            }
        }

        return total;
    }

    public static int parallelBatchDelete(DataSource pool, String table, String condition)
            throws SQLException, OccRetry.MaxRetriesExceededException {
        return parallelBatchDelete(pool, table, condition, 4, 1000, 3, 100);
    }
}
