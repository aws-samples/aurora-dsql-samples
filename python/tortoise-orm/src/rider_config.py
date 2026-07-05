import os
import re
import ssl as ssl_module

import asyncpg
import boto3
from tortoise import Tortoise


CLUSTER_ENDPOINT = os.environ["CLUSTER_ENDPOINT"]
CLUSTER_REGION = os.environ.get("CLUSTER_REGION", "us-east-1")
CLUSTER_USER = os.environ.get("CLUSTER_USER")

if not CLUSTER_USER:
    raise ValueError(
        "Missing required environment variable CLUSTER_USER. "
        "Set to 'admin' for admin access or your app role name (e.g., 'rideshare_app') for non-admin."
    )

# Admin uses "public" schema; non-admin users use a custom schema
ADMIN_USER = "admin"
SCHEMA = "public" if CLUSTER_USER == ADMIN_USER else os.environ.get("CLUSTER_SCHEMA", "rideshare")

# Validate schema name to prevent SQL injection via environment variable tampering
if not re.fullmatch(r'[a-zA-Z_][a-zA-Z0-9_]*', SCHEMA):
    raise ValueError(f"Invalid schema name: '{SCHEMA}'. Must be alphanumeric/underscore only.")


def generate_auth_token() -> str:
    """Generate a short-lived IAM authentication token for Aurora DSQL.

    Uses generate_db_connect_admin_auth_token() for the admin user,
    and generate_db_connect_auth_token() for non-admin (app) users.
    Tokens are valid for 15 minutes. For long-running applications,
    regenerate tokens before creating new connections."""
    client = boto3.client("dsql", region_name=CLUSTER_REGION)
    if CLUSTER_USER == ADMIN_USER:
        token = client.generate_db_connect_admin_auth_token(
            CLUSTER_ENDPOINT, CLUSTER_REGION
        )
    else:
        token = client.generate_db_connect_auth_token(
            CLUSTER_ENDPOINT, CLUSTER_REGION
        )
    return token


async def _dsql_safe_reset(self, *, timeout=None):
    """Narrowed reset for Aurora DSQL compatibility.

    asyncpg's default Connection.reset() calls pg_advisory_unlock_all(),
    which Aurora DSQL does not support. This replacement performs session
    cleanup (RESET ALL) while skipping the unsupported advisory lock call.
    Note: DEALLOCATE ALL is intentionally omitted because it conflicts with
    asyncpg's internal prepared statement cache.

    IMPORTANT: This also drops asyncpg's conditional ROLLBACK. This is safe
    because Tortoise ORM runs all operations in autocommit mode by default.
    If you wrap work in an explicit transaction, the pool could reuse a
    connection mid-transaction — use Tortoise's transaction context manager
    which handles commit/rollback itself.
    """
    await self.execute("RESET ALL")


def _connection_params() -> dict:
    """Build shared connection parameters for Aurora DSQL.

    Returns a dict with host, port, user, password (IAM token), database,
    and ssl context. Used by both init_db() and create_schema() to avoid
    duplicating connection setup logic.
    """
    return {
        "host": CLUSTER_ENDPOINT,
        "port": 5432,
        "user": CLUSTER_USER,
        "password": generate_auth_token(),
        "database": "postgres",
        "ssl": ssl_module.create_default_context(),
    }


async def init_db():
    """Initialize Tortoise ORM with Aurora DSQL connection.

    This function:
    1. Generates an IAM token via boto3
    2. Patches asyncpg's connection reset to avoid unsupported advisory locks
    3. Creates an SSL context for TLS (required by Aurora DSQL)
    4. Initializes Tortoise ORM with the asyncpg backend
    """
    # Patch asyncpg Connection.reset to skip pg_advisory_unlock_all
    asyncpg.connection.Connection.reset = _dsql_safe_reset

    params = _connection_params()

    await Tortoise.init(
        config={
            "connections": {
                "default": {
                    "engine": "tortoise.backends.asyncpg",
                    "credentials": {
                        **params,
                        "schema": SCHEMA,
                    },
                }
            },
            "apps": {
                "rideshare": {
                    "models": ["rider_models"],
                    "default_connection": "default",
                }
            },
        }
    )


async def create_schema():
    """Create database tables one at a time using a raw asyncpg connection.

    Aurora DSQL does not support multiple DDL statements in a single
    transaction. Each CREATE TABLE executes as its own statement.
    We use a raw asyncpg connection (not the Tortoise pool) to avoid
    pool reset issues during DDL execution."""
    raw_conn = await asyncpg.connect(**_connection_params())

    tables = [
        """CREATE TABLE IF NOT EXISTS rider (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) NOT NULL,
            email VARCHAR(150) NOT NULL UNIQUE,
            phone VARCHAR(20) NOT NULL,
            rating DECIMAL(3,2) DEFAULT 5.00,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS driver (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) NOT NULL,
            email VARCHAR(150) NOT NULL UNIQUE,
            phone VARCHAR(20) NOT NULL,
            license_plate VARCHAR(20) NOT NULL,
            vehicle_model VARCHAR(50) NOT NULL,
            rating DECIMAL(3,2) DEFAULT 5.00,
            is_available BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS ride (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            rider_id UUID NOT NULL,
            driver_id UUID,
            pickup_location VARCHAR(200) NOT NULL,
            dropoff_location VARCHAR(200) NOT NULL,
            status VARCHAR(20) DEFAULT 'requested',
            fare_amount DECIMAL(10,2),
            requested_at TIMESTAMPTZ DEFAULT NOW(),
            completed_at TIMESTAMPTZ
        )""",
        """CREATE TABLE IF NOT EXISTS payment (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ride_id UUID NOT NULL,
            rider_id UUID NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            payment_method VARCHAR(30) NOT NULL,
            status VARCHAR(20) DEFAULT 'pending',
            processed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )""",
    ]

    try:
        # Set search_path to the appropriate schema
        await raw_conn.execute(f"SET search_path TO {SCHEMA}")
        for ddl in tables:
            await raw_conn.execute(ddl)
    finally:
        await raw_conn.close()


async def close_db():
    """Close all Tortoise ORM database connections."""
    await Tortoise.close_connections()
