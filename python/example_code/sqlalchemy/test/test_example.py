from example import crud
import pytest
import os

# Smoke tests that our example works fine
def test_example():
    try:
        # NOTE:
        # 1. Assumes the one who runs the test is part of xanadu-dev posix group
        # 2. Assumes ada is installed
        # TODO:
        # If the test is run on a remote instance we can skip this step and
        # just rely on DefaultCredentialsProvider by attaching a role to that instance.
        os.system('ada credentials update --role=ConnectRole --account 851725170178 --once')
        crud()
    except Exception as e:
        pytest.fail("Unexpected exception: " + str(e))