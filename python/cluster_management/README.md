# Aurora DSQL Python code examples

## Overview

The code examples in this topic show you how to use the AWS Python SDK with DSQL
to create, update, get, and delete single- and multi-Region clusters.

Each file in the [/src](src) directory demonstrates a minimum
working example for each operation. The example function for each operation is invoked
in [`test_dsql_cluster_management.py`](test/test_dsql_cluster_management.py).

## Run the examples

### ⚠️ Important

- Running this code might result in charges to your AWS account.
- We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
- This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

### Prerequisites

- Python version >= 3.10 is installed.
- Valid AWS credentials can be discovered by the [default provider chain](https://boto3.amazonaws.com/v1/documentation/api/latest/guide/credentials.html).

### Execute tests to create and delete clusters

```sh
# Optional: Single-Region examples will execute in CLUSTER_1_REGION. Defaults to 'us-east-1'.
export CLUSTER_1_REGION="us-east-1"

# Optional: Multi-Region examples will create clusters in CLUSTER_1_REGION and CLUSTER_2_REGION
# with WITNESS_REGION as witness for both. Defaults to 'us-east-2' for CLUSTER_2_REGION
# and 'us-west-2' for WITNESS_REGION.
export CLUSTER_2_REGION="us-east-2"
export WITNESS_REGION="us-west-2"

python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Will create, update, read, then delete clusters, use -s to see print statements when running tests
pytest test/test_dsql_cluster_management.py [-s]
```

Test execution will take around five minutes as it waits for clusters to complete activation and deletion.

### Executing single operations

Files in [src/](src/) each have a `main()` function that let you exercise single operations.

```shell
# Check each operation for its expected environment variables
CLUSTER_1_REGION="us-east-1" CLUSTER_1_ID="<your cluster id>" \
  python src/get_cluster.py
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
