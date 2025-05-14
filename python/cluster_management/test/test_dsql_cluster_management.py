from create_single_region import create_cluster
from delete_single_region import delete_cluster
from create_multi_region import create_multi_region_clusters
from delete_multi_region import delete_multi_region_clusters
from get_cluster import get_cluster
from update_cluster import update_cluster

import boto3
import os
import pytest

region_1 = os.environ.get("REGION_1", "us-east-1")
region_2 = os.environ.get("REGION_2", "us-east-2")
witness_region = os.environ.get("WITNESS_REGION", "us-west-2")


@pytest.fixture(scope='session', autouse=True)
def run_after_tests():
    yield
    if os.environ.get('IS_CI') == "TRUE":
        print(f"This is a CI run. Scanning for leaked clusters.")
        delete_tests_clusters(region_1)
        delete_tests_clusters(region_2)


def test_single_region():
    try:
        print("Running single region test.")
        cluster = create_cluster(region_1)
        cluster_id = cluster["identifier"]
        assert cluster_id is not None

        get_response = get_cluster(region_1, cluster_id)
        assert get_response["arn"] is not None
        assert get_response["deletionProtectionEnabled"] is True

        update_cluster(region_1, cluster_id, deletion_protection_enabled=False)

        get_response = get_cluster(region_1, cluster_id)
        assert get_response["arn"] is not None
        assert get_response["deletionProtectionEnabled"] is False

        delete_cluster(region_1, cluster_id)
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


def delete_tests_clusters(region):
    """
    Delete all clusters that are:
        1. Not already deleting; and,
        2. Tagged with 'Repo=aws-samples/aurora-dsql-samples'; and,
        3. Tagged with 'Name=Python*'
    """
    print(f"Deleting clusters associated with Python cluster management tests in {region}.")
    client = boto3.client("dsql", region_name=region)

    clusters_to_delete = []

    # Get all clusters
    paginator = client.get_paginator('list_clusters')

    for page in paginator.paginate():
        for listed_cluster in page['clusters']:
            # Get detailed cluster info
            cluster = client.get_cluster(identifier=listed_cluster['identifier'])

            # Skip clusters that are already being deleted or are deleted
            if cluster['status'] in ['DELETED', 'DELETING']:
                continue

            # Check tags to identify test clusters
            try:
                tags_resp = client.list_tags_for_resource(resourceArn=cluster['arn'])
                tags = tags_resp.get('tags', {})

                is_test_cluster = (
                        tags.get('Repo', '') == 'aws-samples/aurora-dsql-samples' and
                        tags.get('Name', '').startswith('Python')
                )

                if is_test_cluster:
                    clusters_to_delete.append(cluster)
            except Exception as e:
                print(f"Error checking tags for cluster {cluster['identifier']}: {e}")

    print(f"Found {len(clusters_to_delete)} clusters to delete.")
    for cluster in clusters_to_delete:
        # Disable deletion protection if enabled
        if cluster.get('deletionProtectionEnabled', False):
            print(f"Disabling deletion protection on {cluster['arn']}")
            client.update_cluster(
                identifier=cluster['identifier'],
                deletionProtectionEnabled=False
            )

        # Delete the cluster
        print(f"Deleting {cluster}")
        client.delete_cluster(identifier=cluster['identifier'])
        print(f"Deleted {cluster['arn']}")
