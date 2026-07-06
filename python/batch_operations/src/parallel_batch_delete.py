# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""Parallel batch DELETE for Aurora DSQL.

Partitions rows across worker threads using
``abs(hashtext(id::text)::bigint) % num_workers`` so that each worker operates on a
disjoint subset, reducing OCC conflicts between workers. Each worker runs a
sequential batch-delete loop on its partition.

NOTE: The ``table`` and ``condition`` parameters are interpolated directly into SQL.
They must come from trusted, developer-controlled sources — never from end-user
input. Use parameterized queries ($1, %s) for user-supplied values within conditions.
"""

import threading

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


def parallel_batch_delete(
    pool, table, condition, num_workers=4, batch_size=1000, max_retries=3, base_delay_ms=100
):
    """Delete rows in parallel using multiple worker threads.

    The commit is included inside the OCC retry scope so that commit-time
    serialization failures (SQLSTATE 40001) are retried automatically.

    Each worker retries a batch with a fresh connection if OCC retries are
    exhausted, up to ``MAX_CONSECUTIVE_FAILURES`` times before giving up.

    Args:
        pool: A ``dsql.AuroraDSQLThreadedConnectionPool`` instance sized to at
            least *num_workers* connections.
        table: Name of the table to delete from (trusted input only).
        condition: SQL WHERE clause without the ``WHERE`` keyword (trusted input only).
        num_workers: Number of parallel worker threads (default 4).
        batch_size: Number of rows to delete per transaction (default 1,000).
        max_retries: Maximum OCC retry attempts per batch (default 3).
        base_delay_ms: Base delay in milliseconds for exponential backoff (default 100).

    Returns:
        Total number of rows deleted across all workers.

    Raises:
        IncompleteBatchError: If rows still match the condition after the operation.
        MaxRetriesExceeded: If any worker exhausts OCC retries.
    """
    if num_workers < 1:
        raise ValueError("num_workers must be >= 1")
    if batch_size < 1:
        raise ValueError("batch_size must be >= 1")

    results = [0] * num_workers
    errors = [None] * num_workers

    def worker(worker_id):
        total_deleted = 0
        consecutive_failures = 0
        # Cast hashtext result to bigint before abs() to avoid integer overflow
        # when hashtext returns INT_MIN (-2147483648).
        partition_condition = (
            f"({condition}) AND abs(hashtext(id::text)::bigint) % {num_workers} = {worker_id}"
        )

        while True:
            conn = pool.getconn()
            try:

                def delete_batch(conn):
                    with conn.cursor() as cur:
                        cur.execute(
                            f"""DELETE FROM {table}
                            WHERE id IN (
                                SELECT id FROM {table}
                                WHERE {partition_condition}
                                LIMIT {batch_size}
                            )"""
                        )
                        deleted = cur.rowcount
                    conn.commit()
                    return deleted

                deleted = execute_with_retry(
                    conn, delete_batch, max_retries=max_retries, base_delay_ms=base_delay_ms
                )
                total_deleted += deleted
                consecutive_failures = 0
                print(
                    f"Worker {worker_id}: Deleted {deleted} rows "
                    f"(total: {total_deleted})"
                )

                if deleted == 0:
                    break
            except MaxRetriesExceeded:
                conn.rollback()
                consecutive_failures += 1
                print(
                    f"Worker {worker_id}: Batch OCC retries exhausted "
                    f"({consecutive_failures}/{MAX_CONSECUTIVE_FAILURES}), "
                    f"retrying batch with fresh connection"
                )
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    errors[worker_id] = MaxRetriesExceeded(max_retries)
                    break
            except Exception as exc:
                conn.rollback()
                errors[worker_id] = exc
                break
            finally:
                pool.putconn(conn)

        results[worker_id] = total_deleted

    threads = [
        threading.Thread(target=worker, args=(i,)) for i in range(num_workers)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # Report partial progress before raising
    total = sum(results)
    failed_workers = [(i, err) for i, err in enumerate(errors) if err is not None]
    if failed_workers:
        print(f"Partial progress: {total} rows deleted before failure")
        for wid, err in failed_workers:
            print(f"  Worker {wid} failed: {err}")
        raise failed_workers[0][1]

    print(f"Parallel delete complete: {total} rows deleted by {num_workers} workers")

    # Post-verification: ensure no matching rows remain (uses original condition, not partitioned)
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) FROM {table} WHERE {condition}")
            remaining = cur.fetchone()[0]
        conn.commit()
        if remaining > 0:
            raise IncompleteBatchError(remaining, total)
    finally:
        pool.putconn(conn)

    return total
