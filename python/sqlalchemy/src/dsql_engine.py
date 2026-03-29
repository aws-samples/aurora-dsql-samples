# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""
Aurora DSQL engine creation with automatic IAM authentication.

Uses the Aurora DSQL Python Connector (psycopg3) for token generation.
The engine runs in AUTOCOMMIT mode because Aurora DSQL does not support
SAVEPOINT, which SQLAlchemy's psycopg dialect uses during initialization.
"""

import os

import aurora_dsql_psycopg as dsql
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine

ADMIN = "admin"
ADMIN_SCHEMA = "public"
NON_ADMIN_SCHEMA = "myschema"


def get_required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable {name}")
    return value


def create_dsql_engine() -> Engine:
    host = get_required_env("CLUSTER_ENDPOINT")
    user = get_required_env("CLUSTER_USER")
    schema = ADMIN_SCHEMA if user == ADMIN else NON_ADMIN_SCHEMA

    engine = create_engine(
        "postgresql+psycopg://",
        creator=lambda: dsql.connect(host=host, user=user, autocommit=True),
        isolation_level="AUTOCOMMIT",
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=0,
        pool_recycle=3300,  # Recycle before DSQL's 1-hour limit
    )

    @event.listens_for(engine, "connect")
    def set_search_path(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute(f"SET search_path TO {schema}")
        cursor.close()

    return engine
