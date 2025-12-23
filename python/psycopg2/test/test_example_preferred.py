import sys
import os

# Add src directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from example_preferred import main

import pytest


def test_example_preferred():
    try:
        main()
    except Exception as e:
        pytest.fail(f"Unexpected exception: {e}")
