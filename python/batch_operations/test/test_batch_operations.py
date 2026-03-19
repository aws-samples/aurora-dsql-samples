# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import os
import re
import subprocess
import sys

import pytest


SETUP_SQL_PATH = os.path.join(os.path.dirname(__file__), "..", "batch_test_setup.sql")


def get_endpoint():
    ep = os.environ.get("CLUSTER_ENDPOINT")
    assert ep, "CLUSTER_ENDPOINT environment variable is required"
    return ep


def get_user():
    return os.environ.get("CLUSTER_USER", "admin")


def extract_region(endpoint):
    """Extract AWS region from a DSQL endpoint like 'xxx.dsql.us-east-1.on.aws'."""
    m = re.search(r"\.dsql\.([^.]+)\.on\.aws", endpoint)
    assert m, f"Cannot extract region from endpoint: {endpoint}"
    return m.group(1)


def run_setup_sql(endpoint, user):
    """Run batch_test_setup.sql via psql."""
    region = extract_region(endpoint)
    token = subprocess.check_output(
        [
            "aws", "dsql", "generate-db-connect-admin-auth-token",
            "--hostname", endpoint,
            "--region", region,
            "--expires-in", "3600",
        ],
        text=True,
    ).strip()

    subprocess.run(
        [
            "psql",
            f"host={endpoint} dbname=postgres user={user} sslmode=verify-full sslrootcert=system connect_timeout=10",
            "-f", SETUP_SQL_PATH,
        ],
        env={**os.environ, "PGPASSWORD": token},
        check=True,
    )


def test_batch_operations():
    """Integration test: seeds the table, then runs the full batch operations demo.

    Requires CLUSTER_ENDPOINT environment variable (and optionally CLUSTER_USER).
    """
    endpoint = get_endpoint()
    user = get_user()

    # Seed the test table
    run_setup_sql(endpoint, user)

    # Set sys.argv so main()'s argparse picks up the endpoint
    sys.argv = ["main.py", "--endpoint", endpoint, "--user", user]

    from main import main
    try:
        main()
    except Exception as e:
        pytest.fail(f"Unexpected exception: {e}")
