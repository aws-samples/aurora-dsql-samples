"""Quick connectivity test: connect to Aurora DSQL, run a simple query, disconnect."""
import asyncio
from rider_config import init_db, close_db
from tortoise import Tortoise


async def main():
    print("1. Connecting to Aurora DSQL...")
    await init_db()
    print("   ✓ Connected successfully")

    print("2. Running test query (SELECT 1)...")
    conn = Tortoise.get_connection("default")
    result = await conn.execute_query("SELECT 1 AS test")
    print(f"   ✓ Query result: {result}")

    print("3. Closing connection...")
    await close_db()
    print("   ✓ Disconnected")

    print("\n✓ All connection tests passed!")


if __name__ == "__main__":
    asyncio.run(main())
