/*
 * Copyright 2024 Amazon.com, Inc. or its affiliates.
 * Licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { DSQLClient } from "@aws-sdk/client-dsql"; 
import { CreateMultiRegionClustersCommand } from "@aws-sdk/client-dsql"; 

async function createMultiRegionCluster(client, linkedRegionList, witnessRegion, clusterProperties) {
    const createMultiRegionClustersCommand = new CreateMultiRegionClustersCommand({
        linkedRegionList: linkedRegionList,
        witnessRegion: witnessRegion,
        clusterProperties: clusterProperties
    });
    try {
        const response = await client.send(createMultiRegionClustersCommand);
        return response;
    } catch (error) {
        console.error("Failed to create multi-region cluster: ", error.message);
    }
}

async function main() {
    const region = "us-east-1";
    const client = new DSQLClient({
        region
    });
    const linkedRegionList = ["us-east-1", "us-east-2"];
    const witnessRegion = "us-west-2";
    const clusterProperties = {
        "us-east-1": { tags: { "Name": "Foo" }, deletionProtectionEnabled: true },
        "us-east-2": { tags: { "Name": "Bar" }, deletionProtectionEnabled: true }
    };

    const response = await createMultiRegionCluster(client, linkedRegionList, witnessRegion, clusterProperties);
    console.log("Linked Cluster ARNs:", response.linkedClusterArns);
}

main();
