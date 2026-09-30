"""Clean up all rideshare demo data from Aurora DSQL.

Run this after reviewing the tables/data created by riders_app.py:
    python cleanup.py
"""
import asyncio
from rider_models import Rider, Driver, Ride, Payment
from rider_config import init_db, close_db


async def cleanup():
    """Remove all test data from rideshare tables."""
    await Payment.all().delete()
    await Ride.all().delete()
    await Driver.all().delete()
    await Rider.all().delete()
    print("  ✓ All rideshare data removed.")


async def main():
    print("Connecting to Aurora DSQL...")
    await init_db()

    print("Cleaning up rideshare demo data...")
    await cleanup()

    await close_db()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
