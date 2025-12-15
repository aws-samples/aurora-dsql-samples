"""
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
"""

import os
from psycopg_pool import AsyncConnectionPool as PsycopgPoolAsync
import aurora_dsql_psycopg as dsql


async def connect_with_pool(cluster_user, cluster_endpoint, region):

    ssl_cert_path = "./root.pem"
    if not os.path.isfile(ssl_cert_path):
        raise FileNotFoundError(f"SSL certificate file not found: {ssl_cert_path}")

    conn_params = {
        "dbname": "postgres",
        "user": cluster_user,
        "host": cluster_endpoint,
        "port": "5432",
        "region": region,
        "sslmode": "verify-full",
        "sslrootcert": ssl_cert_path,
    }

    async with PsycopgPoolAsync(
        "",
        connection_class=dsql.DSQLAsyncConnection,
        kwargs=conn_params,  # Pass params as kwargs
        min_size=2,
        max_size=10,
        max_lifetime=3300,
    ) as pool:

        async with pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT 1")
                result = await cur.fetchone()
                print(f"Query result: {result}")
                assert result[0] == 1


async def main():

    try:
        cluster_user = os.environ.get("CLUSTER_USER", None)
        assert cluster_user is not None, "CLUSTER_USER environment variable is not set"

        cluster_endpoint = os.environ.get("CLUSTER_ENDPOINT", None)
        assert (
            cluster_endpoint is not None
        ), "CLUSTER_ENDPOINT environment variable is not set"

        region = os.environ.get("REGION", None)
        assert region is not None, "REGION environment variable is not set"
        await connect_with_pool(cluster_user, cluster_endpoint, region)
    finally:
        pass

    print("Async connection pool exercised successfully")


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
