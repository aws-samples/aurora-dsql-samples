/* Copyright 2024 Amazon.com, Inc. or its affiliates.
 * Licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License. */

#include "CreateSingleRegion.h"

using namespace Aws;
using namespace Aws::DSQL;
using namespace Aws::DSQL::Model;

Aws::String createCluster(Aws::DSQL::DSQLClient& client, bool deletionProtectionEnabled, const std::map<Aws::String, Aws::String>& tags) {
    CreateClusterRequest request;
    request.SetDeletionProtectionEnabled(deletionProtectionEnabled);
    request.SetTags(tags);
    CreateClusterOutcome outcome = client.CreateCluster(request);

    const auto& clusterResult = outcome.GetResult().GetIdentifier();
    if (outcome.IsSuccess()) {
        std::cout << "Cluster Identifier: " << clusterResult << std::endl;
    } else {
        std::cerr << "Create operation failed: " << outcome.GetError().GetMessage() << std::endl;
    }
    return clusterResult;
}