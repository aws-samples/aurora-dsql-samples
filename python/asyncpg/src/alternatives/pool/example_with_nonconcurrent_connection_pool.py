"""
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""

import asyncio
import os

import aurora_dsql_asyncpg as dsql


async def connect_with_pool(cluster_user, cluster_endpoint):
    ssl_cert_path = "./root.pem"
    if not os.path.isfile(ssl_cert_path):
        raise FileNotFoundError(f"SSL certificate file not found: {ssl_cert_path}")

    pool_params = {
        "user": cluster_user,
        "host": cluster_endpoint,
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

        ssl_cert_path = "./root.pem"
        if not os.path.isfile(ssl_cert_path):
            raise FileNotFoundError(f"SSL certificate file not found: {ssl_cert_path}")

        await connect_with_pool(cluster_user, cluster_endpoint)

    finally:
        pass

    print("Pool exercised successfully")


if __name__ == "__main__":
    asyncio.run(main())
