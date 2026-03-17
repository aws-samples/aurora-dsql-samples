# Aurora DSQL with Npgsql

## Overview

This code example demonstrates how to use Npgsql with Amazon Aurora DSQL.
The example shows you how to connect to an Aurora DSQL cluster and perform basic database operations.

Aurora DSQL is a distributed SQL database service that provides high availability and scalability for
your PostgreSQL-compatible applications. Npgsql is a popular PostgreSQL adapter for .NET that allows
you to interact with PostgreSQL databases using C# code.

## About the code example

This example uses the [Aurora DSQL Npgsql Connector](https://github.com/awslabs/aurora-dsql-connectors/tree/main/dotnet/npgsql) which automatically handles IAM token generation for authentication.

The preferred example (`src/ExamplePreferred.cs`) uses `AuroraDsql.CreateDataSourceAsync()` with automatic
token management, connection pooling, and OCC retry.

Alternative approaches are available in `src/alternatives/`:

* **SingleConnection** (`src/alternatives/SingleConnection/`) — Uses `AuroraDsql.ConnectAsync()` for
  a single unpooled connection, suitable for scripts or simple use cases.
* **ManualToken** (`src/alternatives/ManualToken/`) — Uses the raw Npgsql driver with `AWSSDK.DSQL`
  to generate tokens directly, useful for custom authentication flows or finer-grained control.

## ⚠️ Important

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
* [.NET 9.0 SDK](https://dotnet.microsoft.com/en-us/download/dotnet/9.0) or later.
* You must have an Aurora DSQL cluster. For information about creating an Aurora DSQL cluster, see the
  [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)
  guide.
* If connecting as a non-admin user (manual token alternative), ensure the user is linked to an IAM role and is granted
  access to the `myschema` schema. See the
  [Using database roles with IAM roles](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/using-database-and-iam-roles.html)
  guide.

### Run the code

The example demonstrates the following operations:

- Opening a connection pool to an Aurora DSQL cluster
- Creating a table
- Inserting data with transactional writes and OCC retry
- Running concurrent queries using the pool

**Note:** Running the example will use actual resources in your AWS account and may incur charges.

Set environment variables for your cluster details:

```bash
# e.g. "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"
export CLUSTER_ENDPOINT="<your cluster endpoint>"
```

Run the tests:

```bash
dotnet test
```

To run the manual token alternative (requires additional environment variables):

```bash
export REGION="<your cluster region>"
export CLUSTER_USER="<your cluster user>"

dotnet test --filter "ManualTokenExampleTest"
```

**Note:** The connector automatically extracts the region from the cluster endpoint and defaults to the `postgres` database.

## Additional resources

* [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
* [Aurora DSQL Npgsql Connector](https://github.com/awslabs/aurora-dsql-connectors/tree/main/dotnet/npgsql)
* [Npgsql Documentation](https://www.npgsql.org/)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
