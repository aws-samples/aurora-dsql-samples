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
import { DeleteMultiRegionClustersCommand } from "@aws-sdk/client-dsql";

async function deleteMultiRegionClusters(linkedClusterArns, client) {
    const deleteMultiRegionClustersCommand = new DeleteMultiRegionClustersCommand({
        linkedClusterArns: linkedClusterArns,
    });
    try {
        const response = await client.send(deleteMultiRegionClustersCommand);
        return response;
    } catch (error) {
        if (error.name === "ResourceNotFoundException") {
            console.log("Some or all Cluster ARNs not found or already deleted");
        } else {
            console.error("Unable to delete multi-region clusters: ", error.message);
        }
        throw error;
    }
}

async function main() {
    const region = "us-east-1";
    const client = new DSQLClient({ region });
    const linkedClusterArns = [
        "arn:aws:dsql:us-east-1:111111999999::cluster/foo0bar1baz2quux3quuux4",
        "arn:aws:dsql:us-east-2:111111999999::cluster/bar0foo1baz2quux3quuux4"
    ];

    const response = await deleteMultiRegionClusters(linkedClusterArns, client);
    console.log("Deleting Clusters with ARNs:", linkedClusterArns);
}

main();
