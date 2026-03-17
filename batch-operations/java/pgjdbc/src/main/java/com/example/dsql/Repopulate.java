// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

package com.example.dsql;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import javax.sql.DataSource;

/**
 * Repopulate test data for Aurora DSQL batch operation samples.
 */
public class Repopulate {

    private static final String INSERT_SQL =
            "INSERT INTO batch_test (category, status, value) "
            + "SELECT "
            + "  (ARRAY['electronics','clothing','food','books','toys'])"
            + "[floor(random() * 5 + 1)], "
            + "  'active', "
            + "  round((random() * 1000)::numeric, 2) "
            + "FROM generate_series(1, ?)";

    public static int repopulateTestData(
            DataSource pool, int rowCount, int batchSize,
            int maxRetries, double baseDelay)
            throws SQLException, OccRetry.MaxRetriesExceededException {

        int totalInserted = 0;
        int remaining = rowCount;

        while (remaining > 0) {
            int currentBatch = Math.min(batchSize, remaining);
            try (Connection conn = pool.getConnection()) {
                conn.setAutoCommit(false);
                final int size = currentBatch;
                int inserted = OccRetry.executeWithRetry(conn, (c) -> {
                    try (PreparedStatement pstmt = c.prepareStatement(INSERT_SQL)) {
                        pstmt.setInt(1, size);
                        return pstmt.executeUpdate();
                    }
                }, maxRetries, baseDelay);

                conn.commit();
                totalInserted += inserted;
                remaining -= inserted;
                System.out.println("Inserted " + inserted + " rows (total: " + totalInserted + ")");
            }
        }
        System.out.println("Repopulation complete: " + totalInserted + " rows inserted");
        return totalInserted;
    }

    public static int repopulateTestData(DataSource pool)
            throws SQLException, OccRetry.MaxRetriesExceededException {
        return repopulateTestData(pool, 5000, 1000, 3, 0.1);
    }
}
