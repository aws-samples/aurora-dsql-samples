# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""Parallel batch UPDATE for Aurora DSQL.

Partitions rows across worker threads using ``abs(hashtext(id::text)) % num_workers``
so that each worker operates on a disjoint subset, avoiding OCC conflicts between
workers. Each worker runs a sequential batch-update loop on its partition.
"""

import threading

from occ_retry import execute_with_retry


def parallel_batch_update(
    pool, table, set_clause, condition, num_workers=4, batch_size=1000, max_retries=3, base_delay=0.1
):
    """Update rows in parallel using multiple worker threads.

    Args:
        pool: A ``dsql.AuroraDSQLThreadedConnectionPool`` instance sized to at
            least *num_workers* connections.
        table: Name of the table to update.
        set_clause: SQL SET expressions (without the ``SET`` keyword).
        condition: SQL WHERE clause (without the ``WHERE`` keyword).
        num_workers: Number of parallel worker threads (default 4).
        batch_size: Number of rows to update per transaction (default 1,000).
        max_retries: Maximum OCC retry attempts per batch (default 3).
        base_delay: Base delay in seconds for exponential backoff (default 0.1).

    Returns:
        Total number of rows updated across all workers.
    """
    results = [0] * num_workers
    errors = [None] * num_workers

    def worker(worker_id):
        total_updated = 0
        partition_condition = (
            f"{condition} AND abs(hashtext(id::text)) % {num_workers} = {worker_id}"
        )

        while True:
            conn = pool.getconn()
            try:

                def update_batch(conn):
                    with conn.cursor() as cur:
                        cur.execute(
                            f"""UPDATE {table} SET {set_clause}, updated_at = NOW()
                            WHERE id IN (
                                SELECT id FROM {table}
                                WHERE {partition_condition}
                                LIMIT {batch_size}
                            )"""
                        )
                        return cur.rowcount

                updated = execute_with_retry(
                    conn, update_batch, max_retries=max_retries, base_delay=base_delay
                )
                conn.commit()
                total_updated += updated
                print(
                    f"Worker {worker_id}: Updated {updated} rows "
                    f"(total: {total_updated})"
                )

                if updated == 0:
                    break
            except Exception as exc:
                conn.rollback()
                errors[worker_id] = exc
                break
            finally:
                pool.putconn(conn)

        results[worker_id] = total_updated

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
    print(f"Parallel update complete: {total} rows updated by {num_workers} workers")
    return total
