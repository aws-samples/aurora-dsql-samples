"""
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""

import os

import aurora_dsql_psycopg2 as dsql


def connect_with_pool(cluster_user, cluster_endpoint):

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

    # Use the pool as a context manager
    with pool as p:
        # Request a connection from the pool
        conn = p.getconn()
        try:
            # Execute a query
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                result = cur.fetchone()
                print(f"Query result: {result}")
                assert result[0] == 1
        finally:
            # Return connection to pool
            p.putconn(conn)


def main():
    try:
        cluster_user = os.environ.get("CLUSTER_USER", None)
        assert cluster_user is not None, "CLUSTER_USER environment variable is not set"

        cluster_endpoint = os.environ.get("CLUSTER_ENDPOINT", None)
        assert (
            cluster_endpoint is not None
        ), "CLUSTER_ENDPOINT environment variable is not set"

        connect_with_pool(cluster_user, cluster_endpoint)
    finally:
        pass

    print("Connection pool exercised successfully")


if __name__ == "__main__":
    main()
