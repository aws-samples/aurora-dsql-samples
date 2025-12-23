import sys
import os
import asyncio

# Add src directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'src', 'alternatives', 'pool'))

from example_with_async_connection_pool import main

import pytest


def test_example_with_async_connection_pool():
    try:
        asyncio.run(main())
    except Exception as e:
        pytest.fail(f"Unexpected exception: {e}")
