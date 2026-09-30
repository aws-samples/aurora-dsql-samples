"""Unit tests for Tortoise ORM Aurora DSQL rideshare example."""

import os
import pytest


@pytest.fixture(autouse=True)
def set_env_vars(monkeypatch):
    """Set required environment variables for testing."""
    monkeypatch.setenv("CLUSTER_ENDPOINT", "test-cluster.dsql.us-east-1.on.aws")
    monkeypatch.setenv("CLUSTER_REGION", "us-east-1")
    monkeypatch.setenv("CLUSTER_USER", "admin")


def test_config_loads_env_vars():
    """Test that rider_config reads environment variables correctly."""
    import rider_config

    assert rider_config.CLUSTER_ENDPOINT == "test-cluster.dsql.us-east-1.on.aws"
    assert rider_config.CLUSTER_REGION == "us-east-1"
    assert rider_config.CLUSTER_USER == "admin"
    assert rider_config.SCHEMA == "public"


def test_config_non_admin_schema(monkeypatch):
    """Test that non-admin user gets custom schema."""
    monkeypatch.setenv("CLUSTER_USER", "rideshare_app")
    monkeypatch.setenv("CLUSTER_SCHEMA", "rideshare")

    # Force reimport with new env vars
    import importlib
    import rider_config

    importlib.reload(rider_config)

    assert rider_config.SCHEMA == "rideshare"


def test_config_invalid_schema_raises(monkeypatch):
    """Test that invalid schema names are rejected."""
    monkeypatch.setenv("CLUSTER_USER", "rideshare_app")
    monkeypatch.setenv("CLUSTER_SCHEMA", "DROP TABLE;--")

    import importlib
    import rider_config

    with pytest.raises(ValueError, match="Invalid schema name"):
        importlib.reload(rider_config)


def test_models_defined():
    """Test that all expected ORM models are defined."""
    import rider_models

    assert hasattr(rider_models, "Rider")
    assert hasattr(rider_models, "Driver")
    assert hasattr(rider_models, "Ride")
    assert hasattr(rider_models, "Payment")


def test_retry_exports():
    """Test that retry module exports expected functions."""
    import retry

    assert callable(retry.with_retry)
    assert callable(retry._is_occ_error)


# --- Async smoke tests for OCC retry logic ---


@pytest.mark.asyncio
async def test_with_retry_succeeds_on_first_attempt():
    """Test that with_retry returns immediately on success."""
    from retry import with_retry
    from unittest.mock import AsyncMock

    fn = AsyncMock(return_value="ok")
    result = await with_retry(fn)
    assert result == "ok"
    assert fn.call_count == 1


@pytest.mark.asyncio
async def test_with_retry_retries_on_occ_error():
    """Test that with_retry retries on OCC conflict (SQLSTATE 40001)."""
    from retry import with_retry
    from asyncpg import SerializationError

    call_count = 0

    async def flaky_fn():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise SerializationError("serialization failure")
        return "recovered"

    result = await with_retry(flaky_fn)
    assert result == "recovered"
    assert call_count == 2


@pytest.mark.asyncio
async def test_with_retry_raises_non_occ_error():
    """Test that with_retry does not retry non-OCC errors."""
    from retry import with_retry

    async def bad_fn():
        raise ValueError("unrelated error")

    with pytest.raises(ValueError, match="unrelated error"):
        await with_retry(bad_fn)


@pytest.mark.asyncio
async def test_with_retry_exhausts_retries():
    """Test that with_retry raises after max retries are exhausted."""
    from retry import with_retry
    from asyncpg import SerializationError

    async def always_conflicts():
        raise SerializationError("serialization failure")

    with pytest.raises(SerializationError):
        await with_retry(always_conflicts, max_retries=2)
