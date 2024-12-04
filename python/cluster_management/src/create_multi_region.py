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
