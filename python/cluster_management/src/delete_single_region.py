import boto3

def delete_cluster(cluster_id, client):
    try: 
        return client.delete_cluster(identifier=cluster_id)
    except:
        print("Unable to delete cluster " + cluster_id)
        raise

def main():
    region = "us-east-1"
    client = boto3.client("dsql", region_name=region)
    cluster_id = "foo0bar1baz2quux3quuux4"
    response = delete_cluster(cluster_id, client)
    print("Deleting cluster with ID: " + cluster_id +  ", Cluster Status: " + response['status'])


if __name__ == "__main__":
    main()
