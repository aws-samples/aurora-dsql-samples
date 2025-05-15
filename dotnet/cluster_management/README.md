# Aurora DSQL C# code examples

## Overview

The code examples in this directory show you how to use the AWS .NET SDK with DSQL to create, update, get, and delete
single- and multi-Region clusters.

Each project in the [examples](examples) directory demonstrates a minimum working example for each operation and
produces an independent executable that can be run.

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
* You must have [.NET 9.0 SDK](https://dotnet.microsoft.com/en-us/download/dotnet/9.0) installed.

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

Each example is a standalone project that can be run independently:

```sh
# Build all examples
dotnet build

# Run a specific example
dotnet run --framework net9.0 --project examples/CreateSingleRegionCluster
dotnet run --framework net9.0 --project examples/CreateMultiRegionClusters
dotnet run --framework net9.0 --project examples/GetCluster
dotnet run --framework net9.0 --project examples/UpdateCluster
dotnet run --framework net9.0 --project examples/DeleteSingleRegionCluster
dotnet run --framework net9.0 --project examples/DeleteMultiRegionClusters
```

### Run the tests

The project includes unit tests that exercise the full lifecycle of both single-region and multi-region clusters:

```sh
# Run all tests
dotnet test

# Run a specific test
dotnet test --filter "DisplayName~TestSingleRegionClusterLifecycle"
dotnet test --filter "DisplayName~TestMultiRegionClusterLifecycle"
```

These examples do not wait for cluster operations to complete. Clusters may still be changing state after an example has
finished executing.

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
