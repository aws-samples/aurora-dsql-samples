"""
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
"""

import pytest
from example_with_connection_pool_concurrent import main


# Smoke tests that our example works fine
def test_example_with_pool_concurrent():
    try:
        main()
    except Exception as e:
        pytest.fail(f"Unexpected exception: {e}")
