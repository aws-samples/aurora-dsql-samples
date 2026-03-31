# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""Main entry point for Aurora DSQL batch operations demo.

Demonstrates sequential and parallel batch DELETE and UPDATE operations
against an Aurora DSQL cluster, with OCC retry logic and connection pooling.

Usage:
    python main.py --endpoint <cluster-endpoint> [--user admin] \
                   [--batch-size 1000] [--num-workers 4]
"""

import argparse
import time

import aurora_dsql_psycopg2 as dsql

from batch_delete import batch_delete
from batch_update import batch_update
from parallel_batch_delete import parallel_batch_delete
from parallel_batch_update import parallel_batch_update


def parse_args():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Aurora DSQL batch operations demo"
    )
    parser.add_argument(
        "--endpoint", required=True, help="Aurora DSQL cluster endpoint"
    )
    parser.add_argument(
        "--user", default="admin", help="Database user (default: admin)"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=1000,
        help="Rows per batch transaction (default: 1000)",
    )
    parser.add_argument(
        "--num-workers",
        type=int,
        default=4,
        help="Number of parallel workers (default: 4)",
    )
    return parser.parse_args()


def create_pool(endpoint, user, num_workers):
    """Create a threaded connection pool sized for parallel workers."""
    conn_params = {
        "user": user,
        "host": endpoint,
        "connect_timeout": 10,
    }
    return dsql.AuroraDSQLThreadedConnectionPool(
        minconn=num_workers,
        maxconn=num_workers,
        **conn_params,
    )


def run_operation(label, func, *args, **kwargs):
    """Run a batch operation, print a summary with elapsed time."""
    print(f"\n{'=' * 60}")
    print(f"  {label}")
    print(f"{'=' * 60}")
    start = time.time()
    total = func(*args, **kwargs)
    elapsed = time.time() - start
    print(f"\n  Summary: {total} rows affected in {elapsed:.2f}s")
    print(f"{'=' * 60}")
    return total


def main():
    args = parse_args()
    pool = create_pool(args.endpoint, args.user, args.num_workers)

    table = "batch_test"
    batch_size = args.batch_size
    num_workers = args.num_workers

    try:
        # 1. Sequential batch DELETE — delete all 'electronics' rows
        run_operation(
            "Sequential Batch DELETE (category = 'electronics')",
            batch_delete,
            pool, table, "category = 'electronics'",
            batch_size=batch_size,
        )

        # 2. Sequential batch UPDATE — update 'clothing' status to 'processed'
        run_operation(
            "Sequential Batch UPDATE (clothing -> processed)",
            batch_update,
            pool, table, "status = 'processed'",
            "category = 'clothing' AND status != 'processed'",
            batch_size=batch_size,
        )

        # 3. Parallel batch DELETE — delete all 'food' rows
        run_operation(
            f"Parallel Batch DELETE (category = 'food') [{num_workers} workers]",
            parallel_batch_delete,
            pool, table, "category = 'food'",
            num_workers=num_workers,
            batch_size=batch_size,
        )

        # 4. Parallel batch UPDATE — update 'books' status to 'archived'
        run_operation(
            f"Parallel Batch UPDATE (books -> archived) [{num_workers} workers]",
            parallel_batch_update,
            pool, table, "status = 'archived'",
            "category = 'books' AND status != 'archived'",
            num_workers=num_workers,
            batch_size=batch_size,
        )

    finally:
        pool.closeall()
        print("\nConnection pool closed. Demo complete.")


if __name__ == "__main__":
    main()
