import boto3

def update_cluster(cluster_id, deletionProtectionEnabled, client):
    try:
        return client.update_cluster(identifier=cluster_id, deletionProtectionEnabled=deletionProtectionEnabled)
    except:
        print("Unable to update cluster")
        raise

def main():
    region = "us-east-1"
    client = boto3.client("dsql", region_name=region)
    cluster_id = "foo0bar1baz2quux3quuux4"
    deletionProtectionEnabled = True
    response = update_cluster(cluster_id, deletionProtectionEnabled, client)
    print("Deletion Protection Updating to: " + str(deletionProtectionEnabled) +  ", Cluster Status: " + response['status'])


if __name__ == "__main__":
    main()
