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

#include <aws/core/Aws.h>
#include <aws/dsql/DSQLClient.h>
#include <aws/dsql/model/CreateMultiRegionClustersRequest.h>
#include <aws/dsql/model/LinkedClusterProperties.h>

std::vector<Aws::String> createMultiRegionCluster(Aws::DSQL::DSQLClient& client, const std::vector<Aws::String>& linkedRegionList, const Aws::String& witnessRegion, const Aws::Map<Aws::String, Aws::DSQL::Model::LinkedClusterProperties>& clusterProperties);
