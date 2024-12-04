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
