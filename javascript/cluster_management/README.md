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

### Execute tests to create and delete clusters

```
npm install

npm test
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
