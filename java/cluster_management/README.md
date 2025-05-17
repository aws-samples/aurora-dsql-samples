# Aurora DSQL Java code examples

## Overview

The code examples in this topic show you how to use the AWS Java SDK v2 with DSQL
to create, update, get, and delete single- and multi-Region clusters.

Each file in the [/example](src/main/java/org/example) directory demonstrates a minimal
working example for each operation. The `example()` method for each operation is invoked
in [`DsqlClusterManagementTest.java`](src/test/java/org/example/DsqlClusterManagementTest.java).

## Run the examples

### ⚠️ Important

- Running this code might result in charges to your AWS account.
- We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
- This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

### Prerequisites

- java version >= 17 is installed.
- Valid AWS credentials can be discovered by the [default provider chain](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/credentials-chain.html).

### Execute tests to create and delete clusters

Optionally configure the regions for cluster creation and run with `mvn test`:

```sh
# Optional: Single-Region examples will execute in CLUSTER_1_REGION. Defaults to 'us-east-1'.
export CLUSTER_1_REGION="us-east-1"

# Optional: Multi-Region examples will create clusters in CLUSTER_1_REGION and CLUSTER_2_REGION
# with WITNESS_REGION as witness for both. Defaults to 'us-east-2' for CLUSTER_2_REGION
# and 'us-west-2' for WITNESS_REGION.
export CLUSTER_2_REGION="us-east-2"
export WITNESS_REGION="us-west-2"

# Will create, update, read, then delete clusters
mvn test
```

Test execution will take around five minutes as it waits for clusters to complete activation and deletion.

### Executing single operations

Files in [src/../example/](src/main/java/org/example) each have a `main()` method that let you exercise single operations.

The build process will produce a single `.jar` that can be invoked as:

```shell
# Build the project if this has not been done yet with 'mvn test'
mvn clean compile assembly:single

# Check each operation for its expected environment variables
CLUSTER_1_REGION="us-east-1" CLUSTER_ID="<your cluster id>" \
  java \
  -cp target/AuroraDSQLClusterCrudExample-1.0-SNAPSHOT-jar-with-dependencies.jar \
  org.example.GetCluster
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
