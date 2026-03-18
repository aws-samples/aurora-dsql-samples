# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""Parallel batch DELETE for Aurora DSQL.

Partitions rows across worker threads using ``abs(hashtext(id::text)) % num_workers``
so that each worker operates on a disjoint subset, avoiding OCC conflicts between
workers. Each worker runs a sequential batch-delete loop on its partition.
"""

import threading

from occ_retry import MaxRetriesExceeded, execute_with_retry

# Stop retrying a batch after this many consecutive OCC exhaustions.
MAX_CONSECUTIVE_FAILURES = 10


def parallel_batch_delete(
    pool, table, condition, num_workers=4, batch_size=1000, max_retries=3, base_delay_ms=100
):
    """Delete rows in parallel using multiple worker threads.

    Each worker retries a batch with a fresh connection if OCC retries are
    exhausted, up to ``MAX_CONSECUTIVE_FAILURES`` times before giving up.

    Args:
        pool: A ``dsql.AuroraDSQLThreadedConnectionPool`` instance sized to at
            least *num_workers* connections.
        table: Name of the table to delete from.
        condition: SQL WHERE clause (without the ``WHERE`` keyword).
        num_workers: Number of parallel worker threads (default 4).
        batch_size: Number of rows to delete per transaction (default 1,000).
        max_retries: Maximum OCC retry attempts per batch (default 3).
        base_delay_ms: Base delay in milliseconds for exponential backoff (default 100).

    Returns:
        Total number of rows deleted across all workers.
    """
    results = [0] * num_workers
    errors = [None] * num_workers

    def worker(worker_id):
        total_deleted = 0
        consecutive_failures = 0
        partition_condition = (
            f"{condition} AND abs(hashtext(id::text)) % {num_workers} = {worker_id}"
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
                        return cur.rowcount

                deleted = execute_with_retry(
                    conn, delete_batch, max_retries=max_retries, base_delay_ms=base_delay_ms
                )
                conn.commit()
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

    for err in errors:
        if err is not None:
            raise err

    total = sum(results)
    print(f"Parallel delete complete: {total} rows deleted by {num_workers} workers")
    return total
