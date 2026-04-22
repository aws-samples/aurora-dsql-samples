# Aurora DSQL with Rust SQLx

## Overview

This code example demonstrates how to use SQLx with Amazon Aurora DSQL.
The example shows you how to connect to an Aurora DSQL cluster and perform basic database operations.

Aurora DSQL is a distributed SQL database service that provides high availability and scalability for
your PostgreSQL-compatible applications. SQLx is a popular async SQL toolkit for Rust that allows
you to interact with PostgreSQL databases using Rust code.

## About the code example

This example uses the [Aurora DSQL SQLx Connector](https://github.com/awslabs/aurora-dsql-connectors/tree/main/rust/sqlx) which automatically handles IAM token generation for authentication.

The preferred example (`example_preferred`) uses connection pooling with automatic token management and OCC retry support. It demonstrates a flexible approach that works for both admin and non-admin users:

* When connecting as an **admin user**, the example uses the `public` schema.
* When connecting as a **non-admin user**, the example uses a custom `myschema` schema.

The **no connection pool example** (`example_no_connection_pool`) demonstrates simpler single-connection usage without pooling or automatic schema detection.

## Important

* Running this code might result in charges to your AWS account.
* We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
* This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

## Run the example

### Prerequisites

* You must have an AWS account, and have your default credentials and AWS Region
  configured as described in the
  [Globally configuring AWS SDKs and tools](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html)
  guide.
* [Rust & Cargo](https://rustup.rs/).
* You must have an Aurora DSQL cluster. For information about creating an Aurora DSQL cluster, see the
  [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)
  guide.
* If connecting as a non-admin user, ensure the user is linked to an IAM role and is granted access to the `myschema`
  schema. See the
  [Using database roles with IAM roles](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/using-database-and-iam-roles.html)
  guide.

### Run the code

The **preferred example** demonstrates the following operations:

- Opening a connection pool to an Aurora DSQL cluster
- Creating a table
- Performing a transactional insert with OCC retry using the `OCCRetryExt` trait (transactions must be idempotent)
- Opting out of OCC retry for operations that don't need it
- Running concurrent queries across multiple tokio tasks

**Note:** Running the example will use actual resources in your AWS account and may incur charges.

Set environment variables for your cluster details:

```bash
# defaults to "admin" if not set
export CLUSTER_USER="<your user>"

# e.g. "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"
export CLUSTER_ENDPOINT="<your endpoint>"
```

Run the preferred example (connection pool with OCC retry):

```bash
cargo run --bin example_preferred
```

Run the no connection pool example:

```bash
cargo run --bin example_no_connection_pool
```

Run the tests:

```bash
cargo test
```

The example contains comments explaining the code and the operations being performed.

## Additional resources

* [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
* [Aurora DSQL SQLx Connector](https://github.com/awslabs/aurora-dsql-connectors/tree/main/rust/sqlx)
* [SQLx Documentation](https://docs.rs/sqlx/latest/sqlx/)
* [AWS SDK for Rust Documentation](https://docs.aws.amazon.com/sdk-for-rust/latest/dg/welcome.html)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
