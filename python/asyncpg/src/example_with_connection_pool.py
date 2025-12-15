"""
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
"""

import asyncio
import os

import aurora_dsql_asyncpg as dsql


async def connect_with_pool(cluster_user, cluster_endpoint, region):
    ssl_cert_path = "./root.pem"
    if not os.path.isfile(ssl_cert_path):
        raise FileNotFoundError(f"SSL certificate file not found: {ssl_cert_path}")

    pool_params = {
        "database": "postgres",
        "user": cluster_user,
        "host": cluster_endpoint,
        "port": 5432,
        "region": region,
        "ssl": "verify-full",
        "sslrootcert": ssl_cert_path,
        "min_size": 2,
        "max_size": 5,
    }

    pool = await dsql.create_pool(**pool_params)
    try:
        async with pool.acquire() as conn:
            result = await conn.fetchval("SELECT 1")
            assert result == 1
    finally:
        await pool.close()


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

        ssl_cert_path = "./root.pem"
        if not os.path.isfile(ssl_cert_path):
            raise FileNotFoundError(f"SSL certificate file not found: {ssl_cert_path}")

        await connect_with_pool(cluster_user, cluster_endpoint, region)

    finally:
        pass

    print("Pool exercised successfully")


if __name__ == "__main__":
    asyncio.run(main())
