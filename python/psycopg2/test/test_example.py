from example import main

import pytest


# Smoke tests that our example works fine
def test_example():
    try:
        main()
    except Exception as e:
        pytest.fail(f"Unexpected exception: {e}")
