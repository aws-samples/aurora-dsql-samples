import boto3
import os


def create_cluster(region):
    try:
        client = boto3.client("dsql", region_name=region)
        tags = {"Name": "Python-CM-Example-Single-Region", "Repo": "aws-samples/aurora-dsql-samples"}
        cluster = client.create_cluster(tags=tags, deletionProtectionEnabled=True)
        print(f"Initiated creation of cluster: {cluster['identifier']}")

        print(f"Waiting for {cluster['arn']} to become ACTIVE")
        client.get_waiter("cluster_active").wait(
            identifier=cluster["identifier"],
            WaiterConfig={
                'Delay': 10,
                'MaxAttempts': 50
            }
        )

        return cluster
    except:
        print("Unable to create cluster")
        raise


def main():
    region = os.environ.get("CLUSTER_REGION", "us-east-1")
    response = create_cluster(region)
    print(f"Created cluster: {response['arn']}")


if __name__ == "__main__":
    main()
