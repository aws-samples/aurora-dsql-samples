# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""Sequential and parallel batch DELETE for Aurora DSQL.

Deletes rows matching a condition in configurable-size batches, committing each
batch as a separate transaction to stay within the 3,000-row mutation limit.
Uses OCC retry logic with exponential backoff for serialization conflicts.

The parallel variant partitions rows across worker threads using
``abs(hashtext(id::text)) % num_workers`` so that each worker operates on a
disjoint subset, avoiding OCC conflicts between workers.
"""

import threading

from occ_retry import MaxRetriesExceeded, execute_with_retry

# Stop retrying a batch after this many consecutive OCC exhaustions.
MAX_CONSECUTIVE_FAILURES = 10


def batch_delete(pool, table, condition, batch_size=1000, max_retries=3, base_delay_ms=100):
    """Delete rows in batches, committing each batch as a separate transaction.

    If a single batch exhausts its OCC retries, the loop retries that batch
    with a fresh connection (up to ``MAX_CONSECUTIVE_FAILURES`` times) instead
    of aborting the entire operation.  Previously committed batches are durable,
    so forward progress is preserved.

    Args:
        pool: A ``dsql.AuroraDSQLThreadedConnectionPool`` instance.
        table: Name of the table to delete from.
        condition: SQL WHERE clause (without the ``WHERE`` keyword).
        batch_size: Number of rows to delete per transaction (default 1,000).
        max_retries: Maximum OCC retry attempts per batch (default 3).
        base_delay_ms: Base delay in milliseconds for exponential backoff (default 100).

    Returns:
        Total number of rows deleted across all batches.
    """
    total_deleted = 0
    consecutive_failures = 0

    while True:
        conn = pool.getconn()
        try:

            def delete_batch(conn):
                with conn.cursor() as cur:
                    cur.execute(
                        f"""DELETE FROM {table}
                        WHERE id IN (
                            SELECT id FROM {table}
                            WHERE {condition}
                            LIMIT {batch_size}
                        )"""
                    )
                    return cur.rowcount

            deleted = execute_with_retry(
                conn, delete_batch, max_retries=max_retries, base_delay_ms=base_delay_ms
            )
            conn.commit()
            total_deleted += deleted
            consecutive_failures = 0  # reset on success
            print(f"Deleted {deleted} rows (total: {total_deleted})")

            if deleted == 0:
                break
        except MaxRetriesExceeded:
            conn.rollback()
            consecutive_failures += 1
            print(
                f"Batch OCC retries exhausted ({consecutive_failures}/"
                f"{MAX_CONSECUTIVE_FAILURES}), retrying batch with fresh connection"
            )
            if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                raise
        except Exception:
            conn.rollback()
            raise
        finally:
            pool.putconn(conn)

    return total_deleted
