from create_single_region import create_cluster
from delete_single_region import delete_cluster
from create_multi_region import create_multi_region_clusters
from delete_multi_region import delete_multi_region_clusters
from get_cluster import get_cluster
from update_cluster import update_cluster

import boto3
import os
import pytest

region = os.environ.get("CLUSTER_REGION", "us-east-1")
region_1 = os.environ.get("CLUSTER_1_REGION", "us-east-1")
region_2 = os.environ.get("CLUSTER_2_REGION", "us-east-2")
witness_region = os.environ.get("WITNESS_REGION", "us-west-2")


def test_single_region():
    try:
        print("Running single region test.")
        cluster = create_cluster(region)
        cluster_id = cluster["identifier"]
        assert cluster_id is not None

        get_response = get_cluster(region, cluster_id)
        assert get_response["arn"] is not None
        assert get_response["deletionProtectionEnabled"] is True

        update_cluster(region, cluster_id, deletion_protection_enabled=False)

        get_response = get_cluster(region, cluster_id)
        assert get_response["arn"] is not None
        assert get_response["deletionProtectionEnabled"] is False

        delete_cluster(region, cluster_id)
    except Exception as e:
        pytest.fail(f"Unexpected exception: {e}")


def test_multi_region():
    try:
        print("Running multi region test.")
        (cluster_1, cluster_2) = create_multi_region_clusters(region_1, region_2, witness_region)

        cluster_id_1 = cluster_1["identifier"]
        assert cluster_id_1 is not None

        cluster_id_2 = cluster_2["identifier"]
        assert cluster_id_2 is not None

        update_cluster(region_1, cluster_id_1, deletion_protection_enabled=False)
        update_cluster(region_2, cluster_id_2, deletion_protection_enabled=False)

        delete_multi_region_clusters(region_1, cluster_id_1, region_2, cluster_id_2)

    except Exception as e:
        pytest.fail(f"Unexpected exception: {e}")
