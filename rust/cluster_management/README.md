# AWS DSQL Rust code examples

## Overview

The code examples in this topic show you how to use DSQL with Rust sqlx.

## Run the examples

### Prerequisites

* Rust version >=1.80 is needed

### Setup test running environment 

Ensure you are authenticated with AWS credentials. No other setup is needed besides having Rust installed.

### Run the example tests

In a terminal run the following command from the sqlx_example:
```sh
# Use the account credentials dedicated for rust
cargo test

# you can also execute the binary
cargo build
./target/debug/crud
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: Apache-2.0