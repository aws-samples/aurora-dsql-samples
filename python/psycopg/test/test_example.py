from example import main
import pytest
import os, sys

# Smoke tests that our example works fine
def test_example():
    try:
        cluster_endpoint = os.environ.get("CLUSTER_ENDPOINT", None)
        region = os.environ.get("REGION", None)
        if cluster_endpoint is None:
            sys.exit("CLUSTER_ENDPOINT environment variable is not set")
        if region is None:
            sys.exit("REGION environment variable is not set")
        main(cluster_endpoint, region)
    except Exception as e:
        pytest.fail("Unexpected exception: " + str(e))
