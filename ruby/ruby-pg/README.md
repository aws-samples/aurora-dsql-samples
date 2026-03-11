# Aurora DSQL with ruby-pg

## Overview

This code example demonstrates how to use ruby-pg with Amazon Aurora DSQL.
The example shows you how to connect to an Aurora DSQL cluster and perform basic database operations.

Aurora DSQL is a distributed SQL database service that provides high availability and scalability for
your PostgreSQL-compatible applications. Ruby-pg is a popular PostgreSQL adapter for Ruby that allows
you to interact with PostgreSQL databases using Ruby code.

## About the code example

This example uses the [Aurora DSQL Ruby-pg Connector](https://github.com/awslabs/aurora-dsql-connectors/tree/main/ruby/pg) which automatically handles IAM token generation for authentication.

The preferred example (`src/example_preferred.rb`) uses `AuroraDsql::Pg.create_pool()` with automatic
token management, connection pooling, and OCC retry.

An alternative manual token approach is available in `src/alternatives/manual_token/`. This example
uses the raw `pg` gem with `aws-sdk-dsql` to generate tokens directly, which is useful for custom
authentication flows or when you need finer-grained control over connections.

The manual token alternative demonstrates a flexible connection approach that works for both admin
and non-admin users:

* When connecting as an **admin user**, the example uses the `public` schema and generates an admin authentication token.
* When connecting as a **non-admin user**, the example uses a custom `myschema` schema and generates a standard authentication token.

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
* Ruby 3+ installed from the [official website](https://www.ruby-lang.org/en/documentation/installation/).

```bash
ruby --version
```

* Libpq is required by ruby-pg. It is included with PostgreSQL installations. On systems without
  PostgreSQL, install it via a package manager:
  - Amazon Linux: `sudo yum install libpq-devel`
  - macOS (Homebrew): `brew install libpq`
  - Or download from the [official website](https://www.postgresql.org/download/)

  You may need to add libpq to your PATH:
  ```bash
  export PATH="$PATH:<your installed location>/libpq/bin"
  ```

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
- Inserting data with transactional writes
- Running concurrent queries using the pool

**Note:** Running the example will use actual resources in your AWS account and may incur charges.

Install dependencies:

```bash
bundle install
```

Set environment variables for your cluster details:

```bash
# e.g. "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"
export CLUSTER_ENDPOINT="<your cluster endpoint>"
```

Run the preferred example:

```bash
ruby src/example_preferred.rb
```

To run the manual token alternative (requires additional environment variables):

```bash
export REGION="<your cluster region>"
export CLUSTER_USER="<your cluster user>"

ruby src/alternatives/manual_token/example.rb
```

Run tests:

```bash
bundle exec rake test
```

## Additional resources

* [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
* [Aurora DSQL Ruby-pg Connector](https://github.com/awslabs/aurora-dsql-connectors/tree/main/ruby/pg)
* [Ruby-pg Documentation](https://deveiate.org/code/pg/)

**Note:** The connector automatically extracts the region from the cluster endpoint and defaults to the `postgres` database.

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
