# Aurora DSQL JDBC Connector with HikariCP Connection Pool Example

## Overview

This example demonstrates how to connect to Aurora DSQL using HikariCP connection pooling with the **Aurora DSQL JDBC Connector**. HikariCP provides:

- **Automatic IAM Authentication**: Connector takes care of authenticating via IAM, no need of any extra code from client side.
- **Token Management**: Connector takes care of generating token, caching it.
- **Connection Pooling**: Reuses database connections to improve performance
- **Configuration**: Tuning options to align with Aurora DSQL's unique requirements

## About the code example

The example maintains the flexible connection approach as maintained in the standalone Aurora DSQL JDBC Connector examples and continues to work for both admin and non-admin users. It introduces connection pooling via the HikariCP library and leverages the Aurora DSQL JDBC Connector's advanced features:

### Aurora DSQL JDBC Connector Integration

The Aurora DSQL JDBC Connector provides seamless integration with HikariCP while handling Aurora DSQL's unique requirements:

- **Automatic IAM Authentication**: Connector takes care of authenticating via IAM, no need of any extra code from client side.
- **Token Management**: Connector takes care of generating token, caching it and refreshing before it expires.

Unlike the direct pgJDBC approach that requires custom token generation logic, the Aurora DSQL JDBC Connector handles all authentication complexity automatically while providing optimal performance with HikariCP.

## ⚠️ Important

- Running this code might result in charges to your AWS account.
- We recommend that you grant your code the least privilege. At most, grant only the
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
- Java Development Kit (JDK): Ensure you have JDK 17+ installed.
  _To verify that Java is installed, you can run:_
  ```bash
  java -version
  ```
- Build Tool: Gradle is used for this project.
  - The project includes a Gradle connector, so no separate Gradle installation is required.
- Aurora DSQL JDBC Connector: The project depends on the Aurora DSQL JDBC Connector library.

- You must have an Aurora DSQL cluster. For information about creating an Aurora DSQL cluster, see the
  [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)
  guide.
- If connecting as a non-admin user, ensure the user is linked to an IAM role and is granted access to the appropriate
  schema. See the
  [Using database roles with IAM roles](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/using-database-and-iam-roles.html)
  guide.

The example demonstrates the following operations:

- Creating a pool of connections to an Aurora DSQL cluster using the Aurora DSQL JDBC Connector
- Creating a table
- Inserting and querying data from different connections from the pool
- Automatic token generation handled by the connector

The example is designed to work with both admin and non-admin users:
- When run as an admin user, it uses the `public` schema
- When run as a non-admin user, it uses the `myschema` schema

### Environment Variables

Set the following environment variables for your cluster details:

```bash
# Required: Aurora DSQL cluster user (e.g., "admin")
export CLUSTER_USER="<your-user>"

# Option 1: Full Aurora DSQL endpoint
export CLUSTER_ENDPOINT="<your-endpoint>"
# e.g., "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"
```

### Run the code

Build and run the example:

```bash
# Build the project
./gradlew build

# Run the example
./gradlew run

```

The example demonstrates successful connection pooling with Aurora DSQL, showing multiple connections being obtained from the pool and database operations being performed successfully.

## HikariCP Configuration

This example uses HikariCP with configuration settings optimized for Aurora DSQL and the Aurora DSQL JDBC Connector. The key configuration parameters include:

### Pool Size Settings

- **Maximum Pool Size**: 20 connections - Production-ready pool size that balances resource usage with performance
- **Minimum Idle**: 5 connections - Keeps connections ready for immediate use, reducing connection acquisition latency

### Connection Lifecycle Management

- **Connection Timeout**: 30 seconds - Maximum time to wait for a connection from the pool
- **Idle Timeout**: 5 minutes (300,000ms) - Connections idle longer than this are removed from the pool
- **Max Lifetime**: 50 minutes (3,000,000ms) - Maximum lifetime of connections in the pool

⚠️ **Aurora DSQL Connection Limitation**: Aurora DSQL has a maximum connection duration limitation. See the `Maximum connection duration` time limit in the [Cluster quotas and database limits in Amazon Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/CHAP_quotas.html) page. The `maxLifetime` setting is configured to 50 minutes to provide a safe margin.

### Connection Validation and Monitoring

- **Connection Test Query**: `SELECT 1` - Simple query to validate connection health
- **Validation Timeout**: 5 seconds - Maximum time for connection validation
- **Leak Detection Threshold**: 60 seconds - Detects potential connection leaks for debugging

### Performance Optimizations

- **Auto Commit**: Enabled by default for optimal performance
- **Schema Setting**: Automatically sets `myschema` for non-admin users
- **MBean Registration**: Enabled for JMX monitoring and metrics

### Aurora DSQL JDBC Connector Configuration

The example configures the Aurora DSQL JDBC Connector through HikariCP data source properties:

- **Driver Class**: `software.amazon.dsql.jdbc.AuroraDsqlDriver` - The Aurora DSQL JDBC Connector driver
- **Token Duration**: default to 8 hours (28800 seconds) - Configurable token lifetime
- **Connection Methods**: Uses `jdbc:aws-dsql:postgresql://` URL format for Aurora DSQL connections
- **Automatic SSL**: SSL configuration is handled automatically by the connector

### Comparison with Direct pgJDBC

Unlike the direct pgJDBC approach that requires:
- Custom token generation logic
- Manual SSL configuration
- Complex connection lifecycle management
- Custom retry mechanisms

The Aurora DSQL JDBC Connector provides all these features automatically, making it much simpler to integrate with HikariCP while providing superior functionality.

These settings provide a production-ready configuration that handles Aurora DSQL's unique requirements including the 60-minute connection limit, automatic token refresh, and secure connections - all managed transparently by the Aurora DSQL JDBC Connector.

## Additional resources

- [Aurora DSQL JDBC Connector Documentation](https://github.com/awslabs/aurora-dsql-jdbc-connector/blob/main/README.md)
- [HikariCP](https://github.com/brettwooldridge/HikariCP)
- [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
- [pgJDBC Documentation](https://jdbc.postgresql.org/documentation/)
- [AWS SDK for Java Documentation](https://docs.aws.amazon.com/sdk-for-java/)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
