# Aurora DSQL with Liquibase

## Overview

This code example demonstrates how to use Liquibase with Amazon Aurora DSQL. The example shows you how to connect to an
Aurora DSQL cluster and manage database schema changes using Liquibase's database migration capabilities.

Aurora DSQL is a distributed SQL database service that provides high availability and scalability for your
PostgreSQL-compatible applications. Liquibase is a database schema change management tool that allows you to track,
version, and deploy database changes in a structured and repeatable way.

## About the code example

The example includes both SQL and JSON changelog formats demonstrating:

- Creating Pet-Clinic tables with UUID primary keys
- Creating indexes with DSQL's `ASYNC` syntax
- Inserting sample data
- Proper rollback configurations for each changeset

### Configuration

Liquibase can be configured using Maven, Gradle, a liquibase.properties file, Docker, Spring Boot, or Java classes, and 
can be incorporated into a larger application or AWS Lambda. The Liquibase options available are similar in all.

A dependency manager like Maven or Gradle is strongly recommended to use the Aurora DSQL Connector for JDBC with Liquibase in order to include the connector's
dependencies.

This example includes a `pom.xml` file that configures the Liquibase Maven plugin with all connection details embedded directly in the configuration:

- **DSQL JDBC Connector**: Uses `software.amazon.dsql:aurora-dsql-jdbc-connector` for Aurora DSQL connectivity
- **Connection URL**: Dynamically constructed using the `CLUSTER_ENDPOINT` environment variable with the format `jdbc:aws-dsql:postgresql://${env.CLUSTER_ENDPOINT}:5432/postgres`
- **Authentication**: Configured for the `admin` user with IAM-based authentication
- **Changelog**: Defaults to `changelog.sql` but can be overridden via command line

## ⚠️ Important

- Running this code might result in charges to your AWS account.
- We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
- This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

## Run the example

### Prerequisites

- You must have an AWS account, and have your default credentials and AWS Region
  configured as described in the
  [Globally configuring AWS SDKs and tools](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html)
  guide.
- [Java 11](https://openjdk.org/) or later.
- [Apache Maven 3.6](https://maven.apache.org/) or later.
- You must have an Aurora DSQL cluster. For information about creating an Aurora DSQL cluster, see the
  [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)
  guide.

### Set environment variables

Set the cluster endpoint environment variable:

```bash
# e.g. "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"
export CLUSTER_ENDPOINT="<your endpoint>"
```

### Run database migrations

Apply the database migrations using the SQL changelog:

```bash
# Apply all pending changesets
mvn liquibase:update
```

Or use the JSON changelog:

```bash
# Apply JSON format changesets
mvn liquibase:update -Dliquibase.changeLogFile=changelog.json
```

### View migration status

Check the status of your migrations:

```bash
# Show migration status
mvn liquibase:status
```

### Rollback changes

Rollback one or more changesets:

```bash
# Rollback the most recent changeset
mvn liquibase:rollback -Dliquibase.rollbackCount=1
```

## Liquibase considerations with Aurora DSQL

When using Liquibase with Aurora DSQL, be aware of the following considerations and limitations:

### Transactions
- Running multiple DDL statements in a single transaction will result in an error
  - Use `runInTransaction:false` when running multiple DDL statements
  - Or separate DDL statements into different changesets

### Index Creation
- Use `CREATE INDEX ASYNC` instead of `CREATE INDEX` for DSQL compatibility
- Structured Liquibase index creation doesn't support the `ASYNC` keyword, so use raw SQL instead

### Primary Keys
- DSQL doesn't support `ALTER TABLE ADD CONSTRAINT` for primary keys
- Define primary keys inline during table creation rather than as separate changesets

## Changelog formats

The example includes two changelog formats:

### SQL Format (`changelog.sql`)
- Uses Liquibase's SQL changelog format
- Includes DDL and DML statements
- Demonstrates proper rollback SQL

### JSON Format (`changelog.json`)
- Uses structured Liquibase JSON format
- Provides type safety and validation

## Additional resources

- [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
- [Liquibase Documentation](https://docs.liquibase.com/)
- [Aurora DSQL Connector for JDBC](https://github.com/awslabs/aurora-dsql-connectors/tree/main/java/jdbc)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
