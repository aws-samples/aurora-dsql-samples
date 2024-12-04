# Aurora DSQL sqlx code examples

## Overview

The code examples in this topic show you how to use DSQL with Rust sqlx.

## Run the examples

### Prerequisites

- Rust version >=1.80 is needed

### Setup test running environment

Ensure you are authenticated with AWS credentials. No other setup is needed besides having Rust installed.

### Run the example tests

In a terminal run the following command from the sqlx:

```sh
# Use the account credentials dedicated for rust
export CLUSTER_ENDPOINT="<your cluster endpoint>"
export REGION="<your cluster region>"

cargo test

# you can also execute the binary
cargo build
./target/debug/sqlx
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: Apache-2.0

