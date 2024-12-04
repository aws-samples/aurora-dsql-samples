from example import multi_region, single_region
import pytest

# Smoke test to validate that our single region example works fine
def test_single_region():
    try:
        single_region()
    except Exception as e:
        pytest.fail("Unexpected exception: " + str(e))
        
# Smoke test to validate that our multi region example works fine
def test_multi_region():
    try:
        multi_region()
    except Exception as e:
        pytest.fail("Unexpected exception: " + str(e))
