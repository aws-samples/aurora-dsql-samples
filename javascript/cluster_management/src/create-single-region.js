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

async function createCluster(client, tags, deletionProtectionEnabled) {
    const createClusterCommand = new CreateClusterCommand({
        deletionProtectionEnabled: deletionProtectionEnabled,
        tags,
    });
    try {
        const response = await client.send(createClusterCommand);
        return response;
    } catch (error) {
        console.error("Failed to create cluster: ", error.message);
    }
}

async function main() {
    const region = "us-east-1";
    const client = new DSQLClient({ region });
    const tags = { Name: "FooBar"};
    const deletionProtectionEnabled = true;

    const response = await createCluster(client, tags, deletionProtectionEnabled);
    console.log("Cluster Id:", response.identifier);
}

main();
