# Aurora DSQL Rust code examples

## Overview

The code examples in this directory show you how to use the AWS Rust SDK with DSQL to create, update, get, and delete
single- and multi-Region clusters.

Each file in the [examples](examples) directory demonstrates a minimum working example for each operation and produces
an independent binary that can be executed.

## Run the examples

### ⚠️ Important

* Running this code might result in charges to your AWS account.
* We recommend that you grant your code least privilege. At most, grant only the minimum permissions required to perform
  the task. For more information,
  see [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
* This code is not tested in every AWS Region. For more information,
  see [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

### Prerequisites

* You must have an AWS account, and have your default credentials and AWS Region configured as described in
  the [Globally configuring AWS SDKs and tools](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html)
* You must have [Rust & Cargo](https://rustup.rs/) installed.

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
# e.g. "foo0bar1baz2quux3quuux4"
export CLUSTER_1_ID="<your id 1>"
export CLUSTER_2_ID="<your id 2>"

# Relevant for all examples.
# e.g. "us-east-1"
export CLUSTER_1_REGION="<your region 1>"
export CLUSTER_2_REGION="<your region 2>"

# Only relevant for create examples.
export WITNESS_REGION="<your region 3>"
```

### Run the examples

Each example is compiled as a separate binary. You can run them individually:

```sh
# Build all examples
cargo build --release

# Run a specific example
./target/release/create_single_region_cluster
./target/release/get_cluster
./target/release/update_cluster
./target/release/delete_single_region_cluster
./target/release/create_multi_region_clusters
./target/release/delete_multi_region_clusters
```

Alternatively, you can use cargo to run a specific example:

```sh
cargo run --bin create_single_region_cluster
cargo run --bin get_cluster
# etc.
```

### Run the tests

The project includes unit tests that exercise the full lifecycle of both single-region and multi-region clusters:

Since the tests can take up to 5 minutes to run, the `--nocapture` flag can be used to show more granular progress.

```sh
# Run all tests
cargo test -- --nocapture

# Run a specific test
cargo test --test single_region_test -- --nocapture
cargo test --test multi_region_test -- --nocapture
```

Example execution will take around five minutes as it waits for clusters to complete activation and deletion.

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0