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
import time
from create_multi_region import create_multi_region_clusters
from delete_multi_region import delete_multi_region_clusters
from create_single_region import create_cluster
from delete_single_region import delete_cluster
from get_cluster import get_cluster
from update_cluster import update_cluster

def multi_region():
    region = "us-east-1"
    client = boto3.client("dsql", region_name=region)

    # Create multi-region clusters
    linkedRegionList = ["us-east-1", "us-east-2"]
    witnessRegion = "us-west-2"
    clusterProperties = {
        "us-east-1": {"deletionProtectionEnabled" : False, "tags": {"Name": "Foo"}},
        "us-east-2": {"deletionProtectionEnabled" : False, "tags": {"Name": "Bar"}}
    }
    response = create_multi_region_clusters(client, linkedRegionList, witnessRegion, clusterProperties)
    linkedClusterArns = response['linkedClusterArns']
    print("Linked Cluster Arns:", linkedClusterArns)

    # Wait until the clusters are created. The wait time is picked randomly
    time.sleep(180)

    # Delete multi-region clusters
    delete_multi_region_clusters(linkedClusterArns, client)
    print("Deleting clusters with ARNs:", linkedClusterArns)
    print("Multi-region cluster created and deleted successfully.")

def single_region():
    region = "us-east-1"
    client = boto3.client("dsql", region_name=region)

    # Create a cluster
    tag = {"Name": "FooBar"}
    deletion_protection = True
    response = create_cluster(client, tags=tag, deletion_protection=deletion_protection)
    cluster_id = response['identifier']
    print("Cluster id: " + cluster_id)

    # Wait until the cluster is created. The wait time is picked randomly.
    time.sleep(90)

    # Get a cluster
    response = get_cluster(cluster_id, client)
    print("Cluster Status: " + response['status'])

    # Update a cluster
    deletionProtectionEnabled = False 
    response = update_cluster(cluster_id, deletionProtectionEnabled, client)
    print("Deletion Protection Updating to: " + str(deletionProtectionEnabled) +  ", Cluster Status: " + response['status'])

    # Wait until the update is applied. The wait time is picked randomly
    time.sleep(5)

    # Delete a cluster
    response = delete_cluster(cluster_id, client)
    print("Deleting cluster with ID: " + cluster_id +  ", Cluster Status: " + response['status'])

    print("Single-region cluster created, updated, and deleted successfully.")

def main():
    multi_region()
    single_region()


if __name__ == "__main__":
    main()
