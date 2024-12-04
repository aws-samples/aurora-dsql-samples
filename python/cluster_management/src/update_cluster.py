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
