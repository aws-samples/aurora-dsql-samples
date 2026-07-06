from tortoise import fields, models
import uuid


class Rider(models.Model):
    """A rider who requests rides."""
    id = fields.UUIDField(primary_key=True, default=uuid.uuid4)
    name = fields.CharField(max_length=100)
    email = fields.CharField(max_length=150, unique=True)
    phone = fields.CharField(max_length=20)
    rating = fields.DecimalField(max_digits=3, decimal_places=2, default=5.00)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "rider"

    def __str__(self):
        return f"Rider({self.name}, {self.email})"


class Driver(models.Model):
    """A driver who fulfills ride requests."""
    id = fields.UUIDField(primary_key=True, default=uuid.uuid4)
    name = fields.CharField(max_length=100)
    email = fields.CharField(max_length=150, unique=True)
    phone = fields.CharField(max_length=20)
    license_plate = fields.CharField(max_length=20)
    vehicle_model = fields.CharField(max_length=50)
    rating = fields.DecimalField(max_digits=3, decimal_places=2, default=5.00)
    is_available = fields.BooleanField(default=True)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "driver"

    def __str__(self):
        return f"Driver({self.name}, {self.vehicle_model})"


class Ride(models.Model):
    """A ride connecting a rider to a driver."""
    id = fields.UUIDField(primary_key=True, default=uuid.uuid4)
    rider_id = fields.UUIDField()
    driver_id = fields.UUIDField(null=True)
    pickup_location = fields.CharField(max_length=200)
    dropoff_location = fields.CharField(max_length=200)
    status = fields.CharField(
        max_length=20,
        default="requested"
    )  # requested, accepted, in_progress, completed, cancelled
    fare_amount = fields.DecimalField(max_digits=10, decimal_places=2, null=True)
    requested_at = fields.DatetimeField(auto_now_add=True)
    completed_at = fields.DatetimeField(null=True)

    class Meta:
        table = "ride"

    def __str__(self):
        return f"Ride({self.pickup_location} -> {self.dropoff_location}, {self.status})"


class Payment(models.Model):
    """A payment for a completed ride."""
    id = fields.UUIDField(primary_key=True, default=uuid.uuid4)
    ride_id = fields.UUIDField()
    rider_id = fields.UUIDField()
    amount = fields.DecimalField(max_digits=10, decimal_places=2)
    payment_method = fields.CharField(max_length=30)  # credit_card, debit_card, wallet
    status = fields.CharField(
        max_length=20,
        default="pending"
    )  # pending, completed, failed, refunded
    processed_at = fields.DatetimeField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "payment"

    def __str__(self):
        return f"Payment({self.amount}, {self.status})"
