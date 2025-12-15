"""
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
"""

from alternatives.example_boto import main

import pytest


# Smoke tests that our example works fine
def test_example():
    try:
        main()
    except Exception as e:
        pytest.fail(f"Unexpected exception: {e}")
