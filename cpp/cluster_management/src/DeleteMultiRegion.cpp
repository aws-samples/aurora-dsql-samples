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

#include <iostream>
#include <vector>
#include "DeleteMultiRegion.h"

using namespace Aws;
using namespace Aws::DSQL;
using namespace Aws::DSQL::Model;

std::vector<Aws::String> deleteMultiRegionClusters(const std::vector<Aws::String>& linkedClusterArns, DSQLClient& client) {
    DeleteMultiRegionClustersRequest request;
    request.SetLinkedClusterArns(linkedClusterArns);

    DeleteMultiRegionClustersOutcome outcome = client.DeleteMultiRegionClusters(request);

    if (outcome.IsSuccess()) {
        std::cout << "Successfully deleted clusters." << std::endl;
        return linkedClusterArns;
    } else {
        std::cerr << "Delete operation failed: " << outcome.GetError().GetMessage() << std::endl;
        return {};
    }
}