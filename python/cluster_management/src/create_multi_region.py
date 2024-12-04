import boto3

def create_multi_region_clusters(client, linkedRegionList, witnessRegion, clusterProperties):
    try:
        response = client.create_multi_region_clusters(
            linkedRegionList=linkedRegionList,
            witnessRegion=witnessRegion,
            clusterProperties=clusterProperties,
        )
        return response
    except:
        print("Unable to create multi-region cluster")
        raise

def main():
    region = "us-east-1"
    client = boto3.client("dsql", region_name=region)
    linkedRegionList = ["us-east-1", "us-east-2"]
    witnessRegion = "us-west-2"
    clusterProperties = {
        "us-east-1": {"tags": {"Name": "Foo"}},
        "us-east-2": {"tags": {"Name": "Bar"}}
    }
    response = create_multi_region_clusters(client, linkedRegionList, witnessRegion, clusterProperties)
    print("Linked Cluster Arns:", response['linkedClusterArns'])


if __name__ == "__main__":
    main()
