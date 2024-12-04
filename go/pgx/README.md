# Aurora DSQL pgx code examples

## Overview

The code examples in this topic show you how to use DSQL with Go pgx.

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
export CLUSTER_ENDPOINT="<your cluster endpoint>"
export REGION="<your cluster region>"
go env -w GOPROXY=direct
go test

# you can also run the example directly
go build
./example
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
