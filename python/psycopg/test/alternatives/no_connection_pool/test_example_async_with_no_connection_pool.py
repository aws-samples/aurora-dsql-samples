import sys
import os
import asyncio

# Add src directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'src', 'alternatives', 'no_connection_pool'))

from example_async_with_no_connection_pool import main

import pytest


def test_example_async_with_no_connection_pool():
    try:
        asyncio.run(main())
    except Exception as e:
        pytest.fail(f"Unexpected exception: {e}")
