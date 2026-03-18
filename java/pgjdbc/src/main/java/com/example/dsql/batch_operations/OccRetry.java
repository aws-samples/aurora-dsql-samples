// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

package com.example.dsql.batch_operations;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.logging.Logger;

/**
 * OCC retry logic with exponential backoff for Aurora DSQL batch operations.
 */
public class OccRetry {

    private static final Logger logger = Logger.getLogger(OccRetry.class.getName());
    private static final String SERIALIZATION_FAILURE = "40001";

    @FunctionalInterface
    public interface DatabaseOperation<T> {
        T execute(Connection connection) throws SQLException;
    }

    public static class MaxRetriesExceededException extends Exception {
        private final int maxRetries;

        public MaxRetriesExceededException(int maxRetries) {
            super("Max retries exceeded: failed after " + maxRetries + " retries");
            this.maxRetries = maxRetries;
        }

        public int getMaxRetries() {
            return maxRetries;
        }
    }

    /**
     * Execute a database operation with OCC conflict retry and exponential backoff.
     *
     * @param connection a JDBC connection (autoCommit should be false)
     * @param operation  the database operation to execute
     * @param maxRetries maximum retry attempts (default 3)
     * @param baseDelayMs  base delay in milliseconds for backoff (default 100)
     * @return the return value of the operation
     */
    public static <T> T executeWithRetry(
            Connection connection,
            DatabaseOperation<T> operation,
            int maxRetries,
            long baseDelayMs) throws MaxRetriesExceededException, SQLException {

        for (int attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return operation.execute(connection);
            } catch (SQLException e) {
                if (SERIALIZATION_FAILURE.equals(e.getSQLState())) {
                    connection.rollback();
                    if (attempt >= maxRetries) {
                        throw new MaxRetriesExceededException(maxRetries);
                    }
                    long delayMs = baseDelayMs * (1L << attempt);
                    logger.warning(String.format(
                            "OCC conflict, retry %d/%d after %dms",
                            attempt + 1, maxRetries, delayMs));
                    try {
                        Thread.sleep(delayMs);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        throw new SQLException("Retry interrupted", ie);
                    }
                } else {
                    throw e;
                }
            }
        }
        throw new MaxRetriesExceededException(maxRetries);
    }

    public static <T> T executeWithRetry(
            Connection connection,
            DatabaseOperation<T> operation) throws MaxRetriesExceededException, SQLException {
        return executeWithRetry(connection, operation, 3, 100);
    }
}
