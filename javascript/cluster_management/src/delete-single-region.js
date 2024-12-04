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
import { DeleteClusterCommand } from "@aws-sdk/client-dsql"; 

async function deleteCluster(clusterId, client) {
    const deleteClusterCommand = new DeleteClusterCommand({
      identifier: clusterId,
    });

    try {
      const response = await client.send(deleteClusterCommand);
      return response;
    } catch (error) {
      if (error.name === "ResourceNotFoundException") {
        console.log("Cluster ID not found or already deleted");
      } else {
        console.error("Unable to delete cluster: ", error.message);
      }
      throw error;
    }
  }

async function main() {
    const region = "us-east-1";
    const client = new DSQLClient({ region });

    const clusterId = "foo0bar1baz2quux3quuux4";

    const response = await deleteCluster(clusterId, client); 
    console.log("Deleting Cluster with Id:", clusterId, "- Cluster Status:", response.status);

}

main();
