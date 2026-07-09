# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os

import aurora_dsql_psycopg as dsql


async def connect_with_pool(cluster_user, cluster_endpoint):
    ssl_cert_path = "./root.pem"
    if not os.path.isfile(ssl_cert_path):
        raise FileNotFoundError(f"SSL certificate file not found: {ssl_cert_path}")

    conn_params = {
        "user": cluster_user,
        "host": cluster_endpoint,
        "sslmode": "verify-full",
        "sslrootcert": ssl_cert_path,
    }

    pool = dsql.create_async_pool(
        "",
        kwargs=conn_params,
        min_size=2,
        max_size=10,
        max_lifetime=3300,
        retry=True,
    )

    async with pool:
        async with pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT 1")
                result = await cur.fetchone()
                print(f"Query result: {result}")
                assert result[0] == 1

        async def insert_owner(conn):
            async with conn.cursor() as cur:
                await cur.execute(
                    "INSERT INTO owner(name, city, telephone) VALUES(%s, %s, %s)",
                    ("John Doe", "Anytown", "555-555-1900"),
                )

        await pool.run_transaction(insert_owner)


async def main():
    try:
        cluster_user = os.environ.get("CLUSTER_USER", None)
        assert cluster_user is not None, "CLUSTER_USER environment variable is not set"

        cluster_endpoint = os.environ.get("CLUSTER_ENDPOINT", None)
        assert cluster_endpoint is not None, "CLUSTER_ENDPOINT environment variable is not set"

        await connect_with_pool(cluster_user, cluster_endpoint)
    finally:
        pass

    print("Async connection pool exercised successfully")


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
