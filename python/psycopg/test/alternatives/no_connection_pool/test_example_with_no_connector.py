import sys
import os

# Add src directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'src', 'alternatives', 'no_connection_pool'))

from example_with_no_connector import main

import pytest


def test_example_with_no_connector():
    try:
        main()
    except Exception as e:
        pytest.fail(f"Unexpected exception: {e}")
