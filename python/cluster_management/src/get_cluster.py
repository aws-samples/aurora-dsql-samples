import boto3
import os
from datetime import datetime
import json


def get_cluster(region, identifier):
    try:
        client = boto3.client("dsql", region_name=region)
        return client.get_cluster(identifier=identifier)
    except:
        print(f"Unable to get cluster {identifier} in region {region}")
        raise


def main():
    region = os.environ.get("CLUSTER_REGION", "us-east-1")
    cluster_id = os.environ.get("CLUSTER_ID")
    assert cluster_id is not None, "Must provide CLUSTER_ID"
    response = get_cluster(region, cluster_id)

    print(json.dumps(response, indent=2, default=lambda obj: obj.isoformat() if isinstance(obj, datetime) else None))


if __name__ == "__main__":
    main()
