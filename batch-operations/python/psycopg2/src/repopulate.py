# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""Repopulate test data for Aurora DSQL batch operation samples.

Inserts rows into the batch_test table in batches, respecting the 3,000-row
transaction limit. Called between DELETE and UPDATE demonstrations to restore
the test dataset.
"""

from occ_retry import execute_with_retry


def repopulate_test_data(pool, row_count=5000, batch_size=1000, max_retries=3, base_delay=0.1):
    """Insert test rows into batch_test in batches.

    Each batch is committed as a separate transaction to stay within the
    3,000-row mutation limit.

    Args:
        pool: A ``dsql.AuroraDSQLThreadedConnectionPool`` instance.
        row_count: Total number of rows to insert (default 5,000).
        batch_size: Number of rows to insert per transaction (default 1,000).
        max_retries: Maximum OCC retry attempts per batch (default 3).
        base_delay: Base delay in seconds for exponential backoff (default 0.1).

    Returns:
        Total number of rows inserted across all batches.
    """
    total_inserted = 0
    remaining = row_count

    while remaining > 0:
        current_batch = min(batch_size, remaining)
        conn = pool.getconn()
        try:

            def insert_batch(conn, size=current_batch):
                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO batch_test (category, status, value) "
                        "SELECT "
                        "  (ARRAY['electronics','clothing','food','books','toys'])"
                        "[floor(random() * 5 + 1)], "
                        "  'active', "
                        "  round((random() * 1000)::numeric, 2) "
                        "FROM generate_series(1, %s)",
                        (size,),
                    )
                    return cur.rowcount

            inserted = execute_with_retry(
                conn, insert_batch, max_retries=max_retries, base_delay=base_delay
            )
            conn.commit()
            total_inserted += inserted
            remaining -= inserted
            print(f"Inserted {inserted} rows (total: {total_inserted})")
        except Exception:
            conn.rollback()
            raise
        finally:
            pool.putconn(conn)

    print(f"Repopulation complete: {total_inserted} rows inserted")
    return total_inserted
