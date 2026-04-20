# Aurora DSQL with PDO_PGSQL

## Overview

This code example demonstrates how to use `PDO_PGSQL` with Amazon Aurora DSQL.
The example shows you how to connect to an Aurora DSQL cluster and perform basic database operations.

Aurora DSQL is a distributed SQL database service that provides high availability and scalability for
your PostgreSQL-compatible applications. `PDO_PGSQL` is PHP's standard PostgreSQL driver that allows
you to interact with PostgreSQL databases using PDO (PHP Data Objects).

## About the code example

This example uses the [Aurora DSQL PHP PDO_PGSQL Connector](https://github.com/awslabs/aurora-dsql-connectors/tree/main/php/pdo_pgsql) which automatically handles IAM token generation for authentication.

The connector provides:

* Automatic IAM token generation via AWS SDK for PHP
* SSL enforcement with `verify-full` mode
* Support for AWS profiles and custom credentials providers
* OCC (Optimistic Concurrency Control) retry with exponential backoff

## ⚠️ Important

* Running this code might result in charges to your AWS account.
* We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
* This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

## Prerequisites

* An AWS account
* PHP 8.2 or later
* `ext-pdo_pgsql` PHP extension
* Composer for dependency management
* AWS credentials configured (see [Credentials Resolution](https://github.com/awslabs/aurora-dsql-connectors/tree/main/php/pdo_pgsql#credentials-resolution))
* An Aurora DSQL cluster

For information about creating an Aurora DSQL cluster, see the [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html) guide.

## Install dependencies

```bash
composer install
```

## Running the examples

### Basic example (recommended approach)

This example demonstrates the recommended way to use the Aurora DSQL PHP connector:

```bash
export CLUSTER_ENDPOINT=your-cluster.dsql.us-east-1.on.aws
php src/example_preferred.php
```

### Alternative: Manual token generation

This example shows how to manually generate IAM tokens without using the connector:

```bash
export CLUSTER_ENDPOINT=your-cluster.dsql.us-east-1.on.aws
php src/alternatives/manual_token/manual_token.php
```

## Additional resources

* [Aurora DSQL User Guide](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
* [Aurora DSQL PHP PDO_PGSQL Connector](https://github.com/awslabs/aurora-dsql-connectors/tree/main/php/pdo_pgsql)
* [PHP PDO Documentation](https://www.php.net/manual/en/book.pdo.php)
* [Packagist Package](https://packagist.org/packages/awslabs/aurora-dsql-pdo-pgsql)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: Apache-2.0
