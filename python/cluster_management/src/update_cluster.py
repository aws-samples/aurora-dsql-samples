import boto3
import os


def update_cluster(region, cluster_id, deletion_protection_enabled):
    try:
        client = boto3.client("dsql", region_name=region)
        return client.update_cluster(identifier=cluster_id, deletionProtectionEnabled=deletion_protection_enabled)
    except:
        print("Unable to update cluster")
        raise


def main():
    region = os.environ.get("REGION_1", "us-east-1")
    cluster_id = os.environ.get("CLUSTER_ID_1")
    assert cluster_id is not None, "Must provide CLUSTER_ID_1"
    deletion_protection_enabled = False
    response = update_cluster(region, cluster_id, deletion_protection_enabled)
    print(f"Updated {response["arn"]} with deletion_protection_enabled: {deletion_protection_enabled}")


if __name__ == "__main__":
    main()
