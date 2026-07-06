# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""Sequential batch UPDATE for Aurora DSQL.

Updates rows matching a condition in configurable-size batches, committing each
batch as a separate transaction to stay within the 3,000-row mutation limit.
Uses a subquery pattern to select rows not yet updated, and sets updated_at =
NOW() to track processed rows.

NOTE: The ``table``, ``set_clause``, and ``condition`` parameters are interpolated
directly into SQL. They must come from trusted, developer-controlled sources — never
from end-user input. Use parameterized queries ($1, %s) for user-supplied values
within conditions.
"""

from occ_retry import MaxRetriesExceeded, execute_with_retry

# Stop retrying a batch after this many consecutive OCC exhaustions.
MAX_CONSECUTIVE_FAILURES = 10


class IncompleteBatchError(Exception):
    """Raised when rows still match the condition after a batch operation completes."""

    def __init__(self, remaining, total_affected):
        super().__init__(
            f"{remaining} rows still match condition after processing {total_affected} rows"
        )
        self.remaining = remaining
        self.total_affected = total_affected


def batch_update(pool, table, set_clause, condition, batch_size=1000, max_retries=3, base_delay_ms=100):
    """Update rows in batches, committing each batch as a separate transaction.

    The commit is included inside the OCC retry scope so that commit-time
    serialization failures (SQLSTATE 40001) are retried automatically.

    Uses a subquery to select rows not yet updated and sets ``updated_at = NOW()``
    on each batch to track which rows have been processed.

    If a single batch exhausts its OCC retries, the loop retries that batch
    with a fresh connection (up to ``MAX_CONSECUTIVE_FAILURES`` times) instead
    of aborting the entire operation.

    Args:
        pool: A ``dsql.AuroraDSQLThreadedConnectionPool`` instance.
        table: Name of the table to update (trusted input only).
        set_clause: SQL SET expressions without the ``SET`` keyword (trusted input only),
            e.g. ``"status = 'processed'"``.
        condition: SQL WHERE clause without the ``WHERE`` keyword (trusted input only)
            that identifies rows needing update.
        batch_size: Number of rows to update per transaction (default 1,000).
        max_retries: Maximum OCC retry attempts per batch (default 3).
        base_delay_ms: Base delay in milliseconds for exponential backoff (default 100).

    Returns:
        Total number of rows updated across all batches.

    Raises:
        IncompleteBatchError: If rows still match the condition after the operation.
        MaxRetriesExceeded: If OCC retries are exhausted after MAX_CONSECUTIVE_FAILURES
            consecutive batch failures.
    """
    if batch_size < 1:
        raise ValueError("batch_size must be >= 1")

    total_updated = 0
    consecutive_failures = 0

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
                    updated = cur.rowcount
                conn.commit()
                return updated

            updated = execute_with_retry(
                conn, update_batch, max_retries=max_retries, base_delay_ms=base_delay_ms
            )
            total_updated += updated
            consecutive_failures = 0  # reset on success
            print(f"Updated {updated} rows (total: {total_updated})")

            if updated == 0:
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

    # Post-verification: ensure no matching rows remain
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) FROM {table} WHERE {condition}")
            remaining = cur.fetchone()[0]
        conn.commit()
        if remaining > 0:
            raise IncompleteBatchError(remaining, total_updated)
    finally:
        pool.putconn(conn)

    return total_updated
