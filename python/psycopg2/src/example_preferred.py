"""
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""

import os
import threading

import aurora_dsql_psycopg2 as dsql


def connect_with_pool_concurrent_connections(cluster_user, cluster_endpoint):

    ssl_cert_path = "./root.pem"
    if not os.path.isfile(ssl_cert_path):
        raise FileNotFoundError(f"SSL certificate file not found: {ssl_cert_path}")

    conn_params = {
        "user": cluster_user,
        "host": cluster_endpoint,
        "sslmode": "verify-full",
        "sslrootcert": ssl_cert_path,
    }

    pool = dsql.AuroraDSQLThreadedConnectionPool(
        minconn=2,
        maxconn=8,
        **conn_params,
    )

    # Shared list to collect exceptions from worker threads
    exceptions = []

    def worker(thread_id):
        try:
            conn = pool.getconn()
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT %s", (thread_id,))
                    result = cur.fetchone()
                    print(f"Thread {thread_id} result: {result}")
                    assert result[0] == thread_id
            finally:
                pool.putconn(conn)
        except Exception as e:
            print(f"Thread {thread_id} failed: {e}")
            exceptions.append((thread_id, e))  # Store exception with thread ID

    NUM_THREADS = 8
    threads = []
    for i in range(NUM_THREADS):
        thread = threading.Thread(target=worker, args=(i + 1,))
        threads.append(thread)
        thread.start()

    # Wait for all threads
    for thread in threads:
        thread.join()

    # Check if any threads had exceptions
    if exceptions:
        print(f"Errors occurred in {len(exceptions)} threads:")
        for thread_id, exc in exceptions:
            print(f"  Thread {thread_id}: {exc}")
        raise RuntimeError(f"One or more worker threads failed: {exceptions}")


def main():
    try:
        cluster_user = os.environ.get("CLUSTER_USER", None)
        assert cluster_user is not None, "CLUSTER_USER environment variable is not set"

        cluster_endpoint = os.environ.get("CLUSTER_ENDPOINT", None)
        assert (
            cluster_endpoint is not None
        ), "CLUSTER_ENDPOINT environment variable is not set"

        connect_with_pool_concurrent_connections(cluster_user, cluster_endpoint)
    finally:
        pass

    print("Connection pool with concurrent connections exercised successfully")


if __name__ == "__main__":
    main()
