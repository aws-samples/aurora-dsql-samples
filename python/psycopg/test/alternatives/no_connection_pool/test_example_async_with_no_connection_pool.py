# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import pytest
from alternatives.no_connection_pool.example_async_with_no_connection_pool import main


# Smoke tests that our async example works fine
@pytest.mark.asyncio
async def test_example_async_with_no_connection_pool():
    try:
        await main()
    except Exception as e:
        pytest.fail(f"Unexpected exception: {e}")
