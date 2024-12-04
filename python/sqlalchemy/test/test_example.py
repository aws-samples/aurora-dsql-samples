# Copyright 2024 Amazon.com, Inc. or its affiliates.
# Licensed under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
# 
#     http://www.apache.org/licenses/LICENSE-2.0
# 
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from example import main
import pytest
import os, sys

# Smoke tests that our example works fine
def test_example():
    try:
        cluster_endpoint = os.environ.get("CLUSTER_ENDPOINT", None)
        region = os.environ.get("REGION", None)
        if cluster_endpoint is None:
            sys.exit("CLUSTER_ENDPOINT environment variable is not set")
        if region is None:
            sys.exit("REGION environment variable is not set")
        main(cluster_endpoint, region)
    except Exception as e:
        pytest.fail("Unexpected exception: " + str(e))
