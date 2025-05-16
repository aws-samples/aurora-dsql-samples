# Aurora DSQL Go SDK code examples

## Overview

The code examples in this topic show you how to use the AWS Go SDK with DSQL to create, read, update, and delete clusters.

## Run the examples

### ⚠️ Important

* Running this code might result in charges to your AWS account.
* We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
* This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

### Prerequisites

* Go version >= 1.21
* Valid AWS credentials can be discovered by the [default provider chain](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/credentials-chain.html).

### Setup test running environment

Ensure you are authenticated with AWS credentials. No other setup is needed besides having Go installed.

### Run the example tests

In a terminal run the following commands:



### Execute tests to create and delete clusters
```sh
make test
```

OR

```shell
go test -v -count=1 ./cmd/create_multi_region
go test -v -count=1 ./cmd/create_single_region
go test -v -count=1 ./cmd/get_cluster
go test -v -count=1 ./cmd/update_cluster
go test -v -count=1 ./cmd/delete_multi_region
go test -v -count=1 ./cmd/delete_single_region
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
