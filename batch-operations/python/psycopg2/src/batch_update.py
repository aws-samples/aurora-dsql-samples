# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""Sequential batch UPDATE for Aurora DSQL.

Updates rows matching a condition in configurable-size batches, committing each
batch as a separate transaction to stay within the 3,000-row mutation limit.
Uses a subquery pattern to select rows not yet updated, and sets updated_at =
NOW() to track processed rows.
"""

from occ_retry import execute_with_retry


def batch_update(pool, table, set_clause, condition, batch_size=1000, max_retries=3, base_delay=0.1):
    """Update rows in batches, committing each batch as a separate transaction.

    Uses a subquery to select rows not yet updated and sets ``updated_at = NOW()``
    on each batch to track which rows have been processed.

    Args:
        pool: A ``dsql.AuroraDSQLThreadedConnectionPool`` instance.
        table: Name of the table to update.
        set_clause: SQL SET expressions (without the ``SET`` keyword),
            e.g. ``"status = 'processed'"``.
        condition: SQL WHERE clause (without the ``WHERE`` keyword) that
            identifies rows needing update.
        batch_size: Number of rows to update per transaction (default 1,000).
        max_retries: Maximum OCC retry attempts per batch (default 3).
        base_delay: Base delay in seconds for exponential backoff (default 0.1).

    Returns:
        Total number of rows updated across all batches.
    """
    total_updated = 0

    while True:
        conn = pool.getconn()
        try:

            def update_batch(conn):
                with conn.cursor() as cur:
                    cur.execute(
                        f"""UPDATE {table} SET {set_clause}, updated_at = NOW()
                        WHERE id IN (
                            SELECT id FROM {table}
                            WHERE {condition}
                            LIMIT {batch_size}
                        )"""
                    )
                    return cur.rowcount

            updated = execute_with_retry(
                conn, update_batch, max_retries=max_retries, base_delay=base_delay
            )
            conn.commit()
            total_updated += updated
            print(f"Updated {updated} rows (total: {total_updated})")

            if updated == 0:
                break
        except Exception:
            conn.rollback()
            raise
        finally:
            pool.putconn(conn)

    return total_updated
