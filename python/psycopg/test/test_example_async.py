"""
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0
"""

import pytest
from example_async import main


# Smoke tests that our async example works fine
@pytest.mark.asyncio
async def test_example_async():
    try:
        await main()
    except Exception as e:
        pytest.fail(f"Unexpected exception: {e}")
