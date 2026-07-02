import asyncio
from datetime import datetime, timezone
from decimal import Decimal

from rider_models import Rider, Driver, Ride, Payment
from rider_config import init_db, create_schema, close_db
from retry import with_retry

# NOTE: This demo uses hardcoded sample data. In production, validate all
# external input (email format, phone format, enum constraints for status
# and payment_method) before passing to ORM model methods.


async def create_riders() -> list[Rider]:
    """Create sample riders."""
    riders_data = [
        {"name": "Alice Chen", "email": "alice@example.com", "phone": "+1-555-0101"},
        {"name": "Bob Martinez", "email": "bob@example.com", "phone": "+1-555-0102"},
        {"name": "Carol Johnson", "email": "carol@example.com", "phone": "+1-555-0103"},
    ]

    riders = []
    for data in riders_data:
        rider = await Rider.create(**data)
        riders.append(rider)
        print(f"  Created rider: {rider.name} (ID: {str(rider.id)[:8]}...)")

    return riders


async def create_drivers() -> list[Driver]:
    """Create sample drivers."""
    drivers_data = [
        {
            "name": "Dave Wilson",
            "email": "dave@example.com",
            "phone": "+1-555-0201",
            "license_plate": "ABC-1234",
            "vehicle_model": "Toyota Camry 2024",
        },
        {
            "name": "Eve Thompson",
            "email": "eve@example.com",
            "phone": "+1-555-0202",
            "license_plate": "XYZ-5678",
            "vehicle_model": "Honda Civic 2023",
        },
    ]

    drivers = []
    for data in drivers_data:
        driver = await Driver.create(**data)
        drivers.append(driver)
        print(f"  Created driver: {driver.name} ({driver.vehicle_model})")

    return drivers


async def request_ride(rider: Rider, pickup: str, dropoff: str) -> Ride:
    """A rider requests a new ride."""
    ride = await Ride.create(
        rider_id=rider.id,
        pickup_location=pickup,
        dropoff_location=dropoff,
        status="requested",
    )
    print(f"  Ride requested: {pickup} → {dropoff} by {rider.name}")
    return ride


async def accept_ride(ride: Ride, driver: Driver) -> Ride:
    """A driver accepts a ride request."""
    ride.driver_id = driver.id
    ride.status = "accepted"
    await ride.save(update_fields=["driver_id", "status"])

    # Mark driver as unavailable
    driver.is_available = False
    await driver.save(update_fields=["is_available"])

    print(f"  Ride accepted by {driver.name} ({driver.vehicle_model})")
    return ride


async def complete_ride(ride: Ride, fare: Decimal) -> Ride:
    """Mark a ride as completed with fare."""
    ride.status = "completed"
    ride.fare_amount = fare
    ride.completed_at = datetime.now(timezone.utc)
    await ride.save(update_fields=["status", "fare_amount", "completed_at"])

    # Mark driver as available again
    if ride.driver_id:
        driver = await Driver.get(id=ride.driver_id)
        driver.is_available = True
        await driver.save(update_fields=["is_available"])

    print(f"  Ride completed. Fare: ${fare}")
    return ride


async def process_payment(ride: Ride, method: str) -> Payment:
    """Process payment for a completed ride."""
    payment = await Payment.create(
        ride_id=ride.id,
        rider_id=ride.rider_id,
        amount=ride.fare_amount,
        payment_method=method,
        status="completed",
        processed_at=datetime.now(timezone.utc),
    )
    print(f"  Payment processed: ${payment.amount} via {method}")
    return payment


async def query_ride_history(rider: Rider):
    """Query all rides for a rider with associated data."""
    rides = await Ride.filter(rider_id=rider.id).order_by("-requested_at")

    print(f"\n  Ride history for {rider.name}:")
    for ride in rides:
        driver_name = "Unassigned"
        if ride.driver_id:
            driver = await Driver.get(id=ride.driver_id)
            driver_name = driver.name

        print(
            f"    {ride.pickup_location} → {ride.dropoff_location} | "
            f"Driver: {driver_name} | Status: {ride.status} | "
            f"Fare: ${ride.fare_amount or 'N/A'}"
        )


async def query_driver_stats():
    """Query driver statistics."""
    drivers = await Driver.all()

    print("\n  Driver Statistics:")
    for driver in drivers:
        completed_rides = await Ride.filter(
            driver_id=driver.id, status="completed"
        ).count()
        print(
            f"    {driver.name} | Vehicle: {driver.vehicle_model} | "
            f"Completed rides: {completed_rides} | "
            f"Available: {'Yes' if driver.is_available else 'No'}"
        )


async def demonstrate_occ_retry():
    """Demonstrate OCC retry pattern for concurrent updates.

    Uses the with_retry() utility which implements exponential backoff
    with jitter. The callable re-reads state from the database on each
    attempt to ensure it works with the latest data."""
    print("\n  Demonstrating OCC retry pattern...")

    driver = await Driver.filter(is_available=True).first()
    if not driver:
        print("    No available drivers for OCC demo")
        return

    driver_id = driver.id

    async def _update_rating():
        """Re-read and update — the retry-safe pattern."""
        d = await Driver.get(id=driver_id)
        d.rating = Decimal("4.85")
        await d.save(update_fields=["rating"])
        return d

    updated = await with_retry(_update_rating)
    print(f"    Rating updated to {updated.rating} for {updated.name}")



async def main():
    """Run the full rideshare demonstration."""
    print("=" * 70)
    print("  Tortoise ORM + Aurora DSQL: Rideshare Application Demo")
    print("=" * 70)

    # Initialize database
    print("\n▶ Initializing database connection...")
    await init_db()

    print("▶ Creating schema...")
    await create_schema()

    # Create riders and drivers
    print("\n▶ Creating riders...")
    riders = await create_riders()

    print("\n▶ Creating drivers...")
    drivers = await create_drivers()

    # Simulate ride workflow
    print("\n▶ Simulating ride workflow...")
    print("\n  --- Ride 1: Alice's morning commute ---")
    ride1 = await request_ride(riders[0], "123 Main St", "456 Office Blvd")
    ride1 = await accept_ride(ride1, drivers[0])
    ride1 = await complete_ride(ride1, Decimal("24.50"))
    await process_payment(ride1, "credit_card")

    print("\n  --- Ride 2: Bob's airport trip ---")
    ride2 = await request_ride(riders[1], "789 Home Ave", "Airport Terminal 2")
    ride2 = await accept_ride(ride2, drivers[1])
    ride2 = await complete_ride(ride2, Decimal("45.00"))
    await process_payment(ride2, "debit_card")

    print("\n  --- Ride 3: Alice's evening return ---")
    ride3 = await request_ride(riders[0], "456 Office Blvd", "123 Main St")
    ride3 = await accept_ride(ride3, drivers[0])
    ride3 = await complete_ride(ride3, Decimal("22.75"))
    await process_payment(ride3, "wallet")

    # Query operations
    print("\n▶ Querying ride history...")
    await query_ride_history(riders[0])

    print("\n▶ Querying driver statistics...")
    await query_driver_stats()

    # OCC retry demonstration
    print("\n▶ OCC retry pattern...")
    await demonstrate_occ_retry()

    # Summary
    print("\n" + "=" * 70)
    total_rides = await Ride.filter(status="completed").count()
    total_revenue = sum(
        [r.fare_amount for r in await Ride.filter(status="completed")]
    )
    total_payments = await Payment.filter(status="completed").count()
    print(f"  Summary: {total_rides} rides completed, "
          f"${total_revenue} revenue, {total_payments} payments processed")
    print("=" * 70)

    # Close connections
    await close_db()
    print("\n✓ Demo completed successfully!")
    print("  Run 'python cleanup.py' when you're done reviewing the data.")


if __name__ == "__main__":
    asyncio.run(main())
