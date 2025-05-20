import boto3
import os


def delete_cluster(region, identifier):
    try:
        client = boto3.client("dsql", region_name=region)
        cluster = client.delete_cluster(identifier=identifier)
        print(f"Initiated delete of {cluster['arn']}")

        print("Waiting for cluster to finish deletion")
        client.get_waiter("cluster_not_exists").wait(
            identifier=cluster["identifier"],
            WaiterConfig={
                'Delay': 10,
                'MaxAttempts': 50
            }
        )
    except:
        print("Unable to delete cluster " + identifier)
        raise


def main():
    region = os.environ.get("CLUSTER_REGION", "us-east-1")
    cluster_id = os.environ.get("CLUSTER_ID")
    assert cluster_id is not None, "Must provide CLUSTER_ID"
    delete_cluster(region, cluster_id)
    print(f"Deleted {cluster_id}")


if __name__ == "__main__":
    main()
