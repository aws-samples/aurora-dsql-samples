# Aurora DSQL JavaScript code examples

## Overview

The code examples in this topic show you how to use the AWS JavaScript SDK v3 with DSQL
to create, update, get, and delete single- and multi-Region clusters.

Each file in the [/src](src) directory demonstrates a minimal
working example for each operation.

## Run the examples

### ⚠️ Important

- Running this code might result in charges to your AWS account.
- We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
- This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

### Prerequisites

- [Node 18.0.0](https://nodejs.org) or later.
- Valid AWS credentials can be discovered by the [default provider chain](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/credentials-chain.html).

### Configure the environment

Set environment variables with your cluster details as required.

#### Single-region clusters

```bash
# Only relevant for delete/get/update examples.
# e.g. "foo0bar1baz2quux3quuux4"
export CLUSTER_ID="<your id>"

# Relevant for all examples.
# e.g. "us-east-1"
export CLUSTER_REGION="<your region>"
```

#### Multi-region clusters

```bash
# Only relevant for delete/get/update examples.
# e.g. "foo0bar1baz2quux3quuux4" and "foo5bar6baz7quux8quuux9"
export CLUSTER_1_ID="<your id 1>"
export CLUSTER_2_ID="<your id 2>"

# Relevant for all examples.
# e.g. "us-east-1" and "us-east-2"
export CLUSTER_1_REGION="<your region 1>"
export CLUSTER_2_REGION="<your region 2>"

# Only relevant for create examples.
# e.g. "us-west-2"
export WITNESS_REGION="<your region 3>"
```

### Execute tests to create and delete clusters

```
npm install

npm test
```

### Executing single operations

Files in the [/src](src) directory have a main() method that lets you exercise single operations.

```
# Check each operation for its expected environment variables
CLUSTER_REGION="us-east-1" CLUSTER_ID="<your cluster id>" \
node ./src/get_cluster.js
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
