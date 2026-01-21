import boto3
import os


def create_multi_region_clusters(region_1, region_2, witness_region):
    try:
        client_1 = boto3.client("dsql", region_name=region_1)
        client_2 = boto3.client("dsql", region_name=region_2)
        run_id = os.environ.get("GITHUB_RUN_ID", "local")
        repo = os.environ.get("GITHUB_REPOSITORY", "local")

        # We can only set the witness region for the first cluster
        cluster_1 = client_1.create_cluster(
            deletionProtectionEnabled=True,
            multiRegionProperties={"witnessRegion": witness_region},
            tags={
                "Name": "Python-CM-Example-Multi-Region",
                "Repo": repo,
                "Type": "cluster-management",
                "RunId": run_id,
            }
        )
        print(f"Created {cluster_1['arn']}")

        # For the second cluster we can set witness region and designate cluster_1 as a peer
        cluster_2 = client_2.create_cluster(
            deletionProtectionEnabled=True,
            multiRegionProperties={"witnessRegion": witness_region, "clusters": [cluster_1["arn"]]},
            tags={
                "Name": "Python-CM-Example-Multi-Region",
                "Repo": repo,
                "Type": "cluster-management",
                "RunId": run_id,
            }
        )

        print(f"Created {cluster_2['arn']}")
        # Now that we know the cluster_2 arn we can set it as a peer of cluster_1
        client_1.update_cluster(
            identifier=cluster_1["identifier"],
            multiRegionProperties={"witnessRegion": witness_region, "clusters": [cluster_2["arn"]]}
        )
        print(f"Added {cluster_2['arn']} as a peer of {cluster_1['arn']}")

        # Now that multiRegionProperties is fully defined for both clusters
        # they'll begin the transition to ACTIVE
        print(f"Waiting for {cluster_1['arn']} to become ACTIVE")
        client_1.get_waiter("cluster_active").wait(
            identifier=cluster_1["identifier"],
            WaiterConfig={
                'Delay': 10,
                'MaxAttempts': 50
            }
        )

        print(f"Waiting for {cluster_2['arn']} to become ACTIVE")
        client_2.get_waiter("cluster_active").wait(
            identifier=cluster_2["identifier"],
            WaiterConfig={
                'Delay': 10,
                'MaxAttempts': 50
            }
        )

        return cluster_1, cluster_2

    except:
        print("Unable to create cluster")
        raise


def main():
    region_1 = os.environ.get("CLUSTER_1_REGION", "us-east-1")
    region_2 = os.environ.get("CLUSTER_2_REGION", "us-east-2")
    witness_region = os.environ.get("WITNESS_REGION", "us-west-2")
    (cluster_1, cluster_2) = create_multi_region_clusters(region_1, region_2, witness_region)
    print("Created multi region clusters:")
    print("Cluster id: " + cluster_1['arn'])
    print("Cluster id: " + cluster_2['arn'])


if __name__ == "__main__":
    main()
