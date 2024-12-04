import boto3

def get_cluster(cluster_id, client):
    try:
        return client.get_cluster(identifier=cluster_id)
    except:
        print("Unable to get cluster")
        raise

def main():
    region = "us-east-1"
    client = boto3.client("dsql", region_name=region)
    cluster_id = "foo0bar1baz2quux3quuux4"
    response = get_cluster(cluster_id, client)
    print("Cluster Status: " + response['status'])


if __name__ == "__main__":
    main()
