"""Integration test for the Tortoise ORM Aurora DSQL rideshare example.

Runs the full demo application against a live Aurora DSQL cluster, verifies
the persisted state, then removes the demo data. Requires CLUSTER_ENDPOINT
and CLUSTER_USER to be set (provided by CI); CLUSTER_REGION is optional and
defaults to us-east-1. Skipped when those are absent so the unit tests can
still run standalone.
"""

import importlib
import os
from decimal import Decimal

import pytest


@pytest.mark.skipif(
    not (os.environ.get("CLUSTER_ENDPOINT") and os.environ.get("CLUSTER_USER")),
    reason="CLUSTER_ENDPOINT and CLUSTER_USER not set; skipping live integration test",
)
@pytest.mark.asyncio
async def test_rideshare_app_end_to_end():
    """Run the rideshare demo end-to-end and verify the persisted data."""
    from tortoise import Tortoise

    # Reload config so it reads the real environment rather than any values
    # left cached by the unit tests, which reload rider_config with mocks.
    import rider_config

    importlib.reload(rider_config)

    from riders_app import main
    from cleanup import cleanup
    from rider_models import Rider, Driver, Ride, Payment

    try:
        # Runs the full flow: schema creation, CRUD, queries, and OCC retry.
        await main()

        # main() closes its connections; reopen to verify persisted state.
        await rider_config.init_db()

        assert await Rider.all().count() == 3
        assert await Driver.all().count() == 2

        completed_rides = await Ride.filter(status="completed")
        assert len(completed_rides) == 3

        total_revenue = sum(r.fare_amount for r in completed_rides)
        assert total_revenue == Decimal("92.25")

        assert await Payment.filter(status="completed").count() == 3
    finally:
        # Clean up so the run is repeatable: the demo uses fixed rider/driver
        # emails with a unique constraint, so leftover rows would fail a rerun.
        # Reopen the connection if it was closed (main() calls close_db()).
        if not Tortoise._inited:
            await rider_config.init_db()
        await cleanup()
        await rider_config.close_db()
