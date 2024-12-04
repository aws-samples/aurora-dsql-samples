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
