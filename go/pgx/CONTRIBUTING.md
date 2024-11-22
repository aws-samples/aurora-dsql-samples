# AWS DSQL Go code examples

## Overview

The code examples in this topic show you how to use DSQL with Go pgx.

## Run the examples

### Prerequisites

- Go version >= 1.21

### Setup test running environment

Ensure you are authenticated with AWS credentials. No other setup is needed besides having Go installed.

### Run the example tests

In a terminal run the following commands:

```sh
# Use the account credentials dedicated for golang
ada credentials update --role=Admin --account 774305617129 --once
go env -w GOPROXY=direct
go test

# you can also do to run the example
go build
./example 
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: Apache-2.0

