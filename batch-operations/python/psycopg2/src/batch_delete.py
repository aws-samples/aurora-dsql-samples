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

from occ_retry import execute_with_retry


def batch_delete(pool, table, condition, batch_size=1000, max_retries=3, base_delay=0.1):
    """Delete rows in batches, committing each batch as a separate transaction.

    Args:
        pool: A ``dsql.AuroraDSQLThreadedConnectionPool`` instance.
        table: Name of the table to delete from.
        condition: SQL WHERE clause (without the ``WHERE`` keyword).
        batch_size: Number of rows to delete per transaction (default 1,000).
        max_retries: Maximum OCC retry attempts per batch (default 3).
        base_delay: Base delay in seconds for exponential backoff (default 0.1).

    Returns:
        Total number of rows deleted across all batches.
    """
    total_deleted = 0

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
                conn, delete_batch, max_retries=max_retries, base_delay=base_delay
            )
            conn.commit()
            total_deleted += deleted
            print(f"Deleted {deleted} rows (total: {total_deleted})")

            if deleted == 0:
                break
        except Exception:
            conn.rollback()
            raise
        finally:
            pool.putconn(conn)

    return total_deleted
