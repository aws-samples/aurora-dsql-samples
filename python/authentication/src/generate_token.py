# Python SDK examples for generating Aurora DSQL authentication tokens

# --8<-- [start:python-generate-token]
def generate_token(your_cluster_endpoint, region):
    client = boto3.client("dsql", region_name=region)
    # use `generate_db_connect_auth_token` instead if you are not connecting as admin.
    token = client.generate_db_connect_admin_auth_token(your_cluster_endpoint, region)
    print(token)
    return token
# --8<-- [end:python-generate-token]