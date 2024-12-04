# Copyright 2024 Amazon.com, Inc. or its affiliates.
# Licensed under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
# 
# http://www.apache.org/licenses/LICENSE-2.0
# 
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

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
