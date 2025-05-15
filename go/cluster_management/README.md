# Aurora DSQL Go SDK code examples

## Overview

The code examples in this topic show you how to use the AWS Go SDK with DSQL to create, read, update, and delete clusters.

## Run the examples

### Prerequisites

* Go version >= 1.21
* AWS credentials file is configured


### Setup test running environment

Ensure you are authenticated with AWS credentials. No other setup is needed besides having Go installed.

### Run the example tests

In a terminal run the following commands:

```sh
# Use the account credentials dedicated for golang
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
