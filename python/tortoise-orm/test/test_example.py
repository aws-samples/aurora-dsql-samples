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
