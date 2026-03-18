# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import pytest
from main import main


def test_batch_operations():
    """Integration test: runs the full batch operations demo against a live cluster.

    Requires CLUSTER_ENDPOINT and CLUSTER_USER environment variables.
    Run with: pytest test/ --endpoint <endpoint> --user <user>
    Or set env vars and run: pytest test/
    """
    try:
        main()
    except Exception as e:
        pytest.fail(f"Unexpected exception: {e}")
