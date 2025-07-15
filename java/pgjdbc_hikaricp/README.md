# Aurora DSQL with HikariCP Connection Pool Example
## Overview
This example demonstrates how to connect to Aurora DSQL using HikariCP connection pooling with `pgJDBC` and Amazon Aurora DSQL.
This project extends the basic Aurora DSQL example by integrating HikariCP. HikariCP provides:
- **Connection Pooling**: Reuses database connections to improve performance
- **Connection Management**: Automatically handles connection lifecycle
- **Monitoring**: Built-in metrics and leak detection
- **Configuration**: Extensive tuning options for optimal performance

## About the code example
The example maintains the flexible connection approach as maintained in the standalone `pgJDBC` and Amazon Aurora DSQL example and continues to work for both admin and non-admin users. It introduces connection pooling via the HikariCP library and supports DSQL's dynamic IAM token generation and token refresh.

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
* Java Development Kit (JDK): Ensure you have JDK 17+ installed.
   _To verify that Java is installed, you can run:_
   ```bash
   java -version
   ```
* Build Tool (Maven or Gradle)
   - _Maven_: Ensure Maven is installed if that is your preferred option. You can download it from the [official website](https://maven.apache.org/download.cgi).
   - _Gradle_: Ensure Gradle is installed if that is your preferred option. You can download it from the [official website](https://gradle.org/install/).
* AWS SDK: Ensure that you set up the latest version of the AWS Java SDK from the [official website](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/setup.html)
* You must have an Aurora DSQL cluster. For information about creating an Aurora DSQL cluster, see the
  [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)
  guide.
* If connecting as a non-admin user, ensure the user is linked to an IAM role and is granted access to the `myschema`
  schema. See the
  [Using database roles with IAM roles](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/using-database-and-iam-roles.html)
  guide.

The example demonstrates the following operations:
- Creating a pool of connections to an Aurora DSQL cluster
- Creating a table
- Inserting and querying data from different connections from the pool
The example is designed to work with both admin and non-admin users:
- When run as an admin user, it uses the `public` schema
- When run as a non-admin user, it uses the `myschema` schema

### Run the code
Set the following environment variables or update the hardcoded values in the code:
```bash
# e.g. "admin"
export CLUSTER_USER="<your user>"
# e.g. "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"
export CLUSTER_ENDPOINT="<your endpoint>"
# e.g. "us-east-1"
export REGION="<your region>"
```

_Maven_:
  ```
  bash
    mvn clean compile
    mvn exec:java -Dexec.mainClass="org.example.Example"
  ```

_Gradle_:
  ```
  bash
    gradle run
  ```

The example demonstrates successful connection pooling with Aurora DSQL, showing multiple connections being obtained from the pool and database operations being performed successfully.

## HikariCP Configuration

This example uses HikariCP with configuration settings optimized for Aurora DSQL. The key configuration parameters include:

### Pool Size Settings
- **Maximum Pool Size**: 20 connections - Production-ready pool size that balances resource usage with performance
- **Minimum Idle**: 5 connections - Keeps connections ready for immediate use, reducing connection acquisition latency

### Connection Lifecycle Management
- **Connection Timeout**: 30 seconds - Maximum time to wait for a connection from the pool
- **Idle Timeout**: 5 minutes (300,000ms) - Connections idle longer than this are removed from the pool
- **Max Lifetime**: 10 minutes (600,000ms) - Maximum lifetime of connections in the pool

These timeout values are specifically set to be shorter than Aurora DSQL's authentication token expiry time to ensure tokens remain valid throughout the connection lifecycle. For more information about Aurora DSQL authentication tokens, see [Using authentication tokens](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/SECTION_authentication-token.html).

### Connection Validation and Monitoring
- **Connection Test Query**: `SELECT 1` - Simple query to validate connection health
- **Validation Timeout**: 5 seconds - Maximum time for connection validation
- **Leak Detection Threshold**: 60 seconds - Detects potential connection leaks for debugging

### Performance Optimizations
- **Auto Commit**: Enabled by default for optimal performance
- **Schema Setting**: Automatically sets `myschema` for non-admin users
- **MBean Registration**: Enabled for JMX monitoring and metrics

### SSL Configuration
The example configures SSL settings required for Aurora DSQL:
- **SSL Mode**: `verify-full` - Ensures secure connections with certificate verification
- **SSL Factory**: Uses PostgreSQL's default Java SSL factory
- **SSL Negotiation**: Direct SSL negotiation for optimal performance

These settings provide a production-ready configuration that handles Aurora DSQL's unique requirements including dynamic token refresh and secure connections.

## Additional resources

* [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
* [pgJDBC Documentation](https://jdbc.postgresql.org/documentation/)
* [AWS SDK for Java Documentation](https://docs.aws.amazon.com/sdk-for-java/)

---
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0