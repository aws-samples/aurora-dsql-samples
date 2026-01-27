# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import asyncio
import os

import aurora_dsql_asyncpg as dsql


async def worker_task(pool, worker_id):
    """Simulate concurrent database operations."""

    async with pool.acquire() as conn:
        result = await conn.fetchval("SELECT $1::int", worker_id)
        return result


async def connect_with_pool_concurrent_connections(cluster_user, cluster_endpoint):
    ssl_cert_path = "./root.pem"
    if not os.path.isfile(ssl_cert_path):
        raise FileNotFoundError(f"SSL certificate file not found: {ssl_cert_path}")

    pool_params = {
        "user": cluster_user,
        "host": cluster_endpoint,
        "ssl": "verify-full",
        "sslrootcert": ssl_cert_path,
        "min_size": 5,
        "max_size": 10,
    }

    pool = None
    try:
        pool = await dsql.create_pool(**pool_params)
        # Run multiple concurrent workers
        num_workers = 5
        tasks = [worker_task(pool, i) for i in range(num_workers)]
        results = await asyncio.gather(*tasks)
        for result in results:
            print(result)
    finally:
        if pool is not None:
            await pool.close()


async def main():
    try:
        cluster_user = os.environ.get("CLUSTER_USER", None)
        assert cluster_user is not None, "CLUSTER_USER environment variable is not set"

        cluster_endpoint = os.environ.get("CLUSTER_ENDPOINT", None)
        assert cluster_endpoint is not None, "CLUSTER_ENDPOINT environment variable is not set"

        await connect_with_pool_concurrent_connections(cluster_user, cluster_endpoint)

    finally:
        pass

    print("Concurrent pool operations completed successfully")


if __name__ == "__main__":
    asyncio.run(main())
