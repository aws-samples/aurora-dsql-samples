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
    region = os.environ.get("CLUSTER_REGION", "us-east-1")
    cluster_id = os.environ.get("CLUSTER_ID")
    assert cluster_id is not None, "Must provide CLUSTER_ID"
    deletion_protection_enabled = False
    response = update_cluster(region, cluster_id, deletion_protection_enabled)
    print(f"Updated {response['arn']} with deletion_protection_enabled: {deletion_protection_enabled}")


if __name__ == "__main__":
    main()
