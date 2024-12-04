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
import { CreateClusterCommand } from "@aws-sdk/client-dsql";
import { GetClusterCommand } from "@aws-sdk/client-dsql";
import { UpdateClusterCommand } from "@aws-sdk/client-dsql";
import { DeleteClusterCommand } from "@aws-sdk/client-dsql";
import { CreateMultiRegionClustersCommand } from "@aws-sdk/client-dsql";
import { DeleteMultiRegionClustersCommand } from "@aws-sdk/client-dsql";
import assert from "assert";

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

export async function executeSingleRegion() {
    const region = "us-east-1";
    const client = new DSQLClient({ region });
    const tags = { Name: "FooBar" };
    const deletionProtectionEnabled = true;

    // Create a cluster
    const createClusterCommand = new CreateClusterCommand({
        deletionProtectionEnabled: deletionProtectionEnabled,
        tags,
    });

    const createClusterResponse = await client.send(createClusterCommand);
    assert(createClusterResponse?.identifier, "The response from the create cluster command has a value");

    // Wait some time for cluster creation. Waiting time is chosen randomly.
    await delay(120 * 1000);

    const clusterId = createClusterResponse.identifier;

    const getClusterCommand = new GetClusterCommand({
        identifier: clusterId,
    });

    const getClusterReponse = await client.send(getClusterCommand);
    assert(getClusterReponse?.status, "The response from the get cluster command has a value");

    const updateClusterCommand = new UpdateClusterCommand({
        identifier: clusterId,
        deletionProtectionEnabled: false
    });

    const updateClusterResponse = await client.send(updateClusterCommand);
    assert(updateClusterResponse?.status, "The response from the update cluster command has a value");

    const deleteClusterCommand = new DeleteClusterCommand({
        identifier: clusterId,
    });

    const deletClusterResponse = await client.send(deleteClusterCommand);
    assert(deletClusterResponse.status, "The response from the delete cluster command has a value");
}

export async function executeMultiRegion() {

    const region = "us-east-1";
    const client = new DSQLClient({
        region
    });
    const linkedRegionList = ["us-east-1", "us-east-2"];
    const witnessRegion = "us-west-2";
    const clusterProperties = {
        "us-east-1": { tags: { "Name": "Foo" }, deletionProtectionEnabled: false },
        "us-east-2": { tags: { "Name": "Bar" }, deletionProtectionEnabled: false }
    };

    const createMultiRegionClustersCommand = new CreateMultiRegionClustersCommand({
        linkedRegionList: linkedRegionList,
        witnessRegion: witnessRegion,
        clusterProperties: clusterProperties
    });

    const createMultiRegionClusterResponse = await client.send(createMultiRegionClustersCommand);
    assert.equal(createMultiRegionClusterResponse?.linkedClusterArns.length, 2, "Two clusters should have been created");

    // Wait some time for cluster creation. Waiting time is chosen randomly.
    await delay(180 * 1000);

    const deleteMultiRegionClustersCommand = new DeleteMultiRegionClustersCommand({
        linkedClusterArns: createMultiRegionClusterResponse.linkedClusterArns
    });

    const deleteMultiRegionClustersResponse = await client.send(deleteMultiRegionClustersCommand);
    assert(!deleteMultiRegionClustersResponse.linkedClusterArns, "There should be no clusters after deletion");
}
