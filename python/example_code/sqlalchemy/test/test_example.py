'''
Copyright 2024 Amazon.com, Inc. or its affiliates.
Licensed under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
'''

from example import crud, run_retry
import pytest
import os

# Smoke tests that our example works fine
def test_example():
    try:
        # NOTE:
        # 1. Assumes the one who runs the test is part of internal dev group 
        # 2. Assumes ada is installed
        # TODO: https://taskei.amazon.dev/tasks/P164113257
        # If the test is run on a remote instance we can skip this step and
        # just rely on DefaultCredentialsProvider by attaching a role to that instance.
        os.system('ada credentials update --role=ConnectRole --account 851725170178 --once')
        crud()
        run_retry()
    except Exception as e:
        pytest.fail("Unexpected exception: " + str(e))
