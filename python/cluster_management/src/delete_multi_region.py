import boto3

def delete_multi_region_clusters(linkedClusterArns, client):
    client.delete_multi_region_clusters(linkedClusterArns=linkedClusterArns)

def main():
    region = "us-east-1"
    client = boto3.client("dsql", region_name=region)
    linkedClusterArns = [
        "arn:aws:dsql:us-east-1:111111999999::cluster/foo0bar1baz2quux3quuux4",
        "arn:aws:dsql:us-east-2:111111999999::cluster/bar0foo1baz2quux3quuux4"
    ]
    delete_multi_region_clusters(linkedClusterArns, client)
    print("Deleting clusters with ARNs:", linkedClusterArns)


if __name__ == "__main__":
    main()
