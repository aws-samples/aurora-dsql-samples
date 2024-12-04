import boto3

def create_cluster(client, tags, deletion_protection):
    try:
        response = client.create_cluster(tags=tags, deletionProtectionEnabled=deletion_protection)
        return response
    except:
        print("Unable to create cluster")
        raise

def main():
    region = "us-east-1"
    client = boto3.client("dsql", region_name=region)
    tag = {"Name": "FooBar"}
    deletion_protection = True
    response = create_cluster(client, tags=tag, deletion_protection=deletion_protection)
    print("Cluster id: " + response['identifier'])


if __name__ == "__main__":
    main()
