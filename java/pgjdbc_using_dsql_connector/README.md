# Aurora DSQL JDBC Connector Examples

## Overview

This code example demonstrates how to use the **Aurora DSQL JDBC Connector** with Amazon Aurora DSQL.
The examples show you how to connect to an Aurora DSQL cluster and perform various database operations
with automatic IAM authentication, token management, and connection lifecycle handling.

Aurora DSQL is a distributed SQL database service that provides high availability and scalability for
your PostgreSQL-compatible applications. The Aurora DSQL JDBC Connector is a specialized driver that
extends pgJDBC with Aurora DSQL-specific features including:

- **Automatic IAM Authentication**: Connector takes care of authenticating via IAM, no need of any extra code from client side.
- **Token Management**: Connector takes care of generating token, caching it.

## About the code examples

The examples demonstrate connection approaches that work for both admin and non-admin users:

### Available Examples

1. **BasicConnectionExample** - Demonstrates various connection methods:
   - Connect using `jdbc:aws-dsql:postgresql://` URL format
   - Connect with custom token duration
   - Connect with AWS profile

2. **CustomCredentialsProviderExample** - Shows custom AWS credentials:
   - Using AWS profile credentials
   - STS assume role credentials
   - Custom credentials provider implementation

## Supported URL Formats

The Aurora DSQL JDBC Connector supports the following URL format:

1. **jdbc:aws-dsql:postgresql**: `jdbc:aws-dsql:postgresql://your-cluster.dsql.us-east-1.on.aws/postgres?user=admin`

## ⚠️ Important

* Running this code might result in charges to your AWS account.
* We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
* This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

## Run the examples

### Prerequisites

* You must have an AWS account, and have your default credentials and AWS Region
  configured as described in the
  [Globally configuring AWS SDKs and tools](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html)
  guide.
* Java Development Kit (JDK): Ensure you have JDK 17+ installed.

   _To verify Java is installed, you can run:_
   ```bash
   java -version
   ```

* Build Tool: Gradle is used for this project.
   - The project includes a Gradle connector, so no separate Gradle installation is required.

* AWS SDK: The project includes the latest version of the AWS Java SDK dependencies.

* Aurora DSQL JDBC Connector: The project includes the latest version of the AWS Aurora DSQL JDBC Connector dependencies

* You must have an Aurora DSQL cluster. For information about creating an Aurora DSQL cluster, see the
  [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)
  guide.

* If connecting as a non-admin user, ensure the user is linked to an IAM role and is granted access to the appropriate
  schema. See the
  [Using database roles with IAM roles](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/using-database-and-iam-roles.html)
  guide.

### Environment Variables

Set the following environment variables for your cluster details:

```bash
# Required: Aurora DSQL cluster endpoint
export CLUSTER_ENDPOINT="<your-cluster-endpoint>"
# e.g., "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"

# Required: Aurora DSQL cluster user (e.g., "admin")
export CLUSTER_USER="<your-user>"

# Optional: AWS profile name for custom credentials
export PROFILE="<your-aws-profile>"

# Optional: IAM role ARN for assume role credentials
export ROLE_ARN="<your-role-arn>"
```

### Run the code

You can use the provided setup script to configure environment variables:

```bash
# Set up environment variables interactively
./setup-env.sh
```

Or set them manually and run the examples:

```bash
# Build the project
./gradlew build

# Run all examples
./gradlew run

# Run specific examples
./gradlew runBasicExample
./gradlew runCredentialsProviderExample
```

## Example Output

When you run the examples, you should see output similar to:

```
Aurora DSQL JDBC Connector - Basic Connection Example

=== Example 1: Connect using jdbc:aws-dsql:postgresql:// URL ===
✓ Connected successfully to Aurora DSQL using jdbc:aws-dsql:postgresql:// URL
Database version: PostgreSQL 16
Current timestamp: 2024-01-15 10:30:45.123

=== Example 2: Connect with Custom Token Duration ===
✓ Connected with custom token duration (4 hours)
Database version: PostgreSQL 16
Current timestamp: 2024-01-15 10:30:45.456

=== Example 3: Connect with AWS Profile ===
✓ Connected successfully using AWS profile
Database version: PostgreSQL 16
Current timestamp: 2024-01-15 10:30:45.789
```

### Logging Configuration

The examples include configurable logging to help with debugging:

- **Detailed Logging**: Set in `src/main/resources/logback.xml` and `logging.properties`
- **Aurora DSQL Connector Logs**: FINE level (detailed connection and token management)
- **AWS SDK Logs**: INFO level (authentication and service calls)
- **PostgreSQL Driver Logs**: DEBUG level (connection details and SQL execution)

To adjust logging levels, modify the configuration files:
- `src/main/resources/logback.xml` - Controls Logback/SLF4J logging
- `src/main/resources/logging.properties` - Controls Java Util Logging

### Connection Methods

**AWS DSQL PostgreSQL Connector Format:**
- `jdbc:aws-dsql:postgresql://your-cluster.dsql.us-east-1.on.aws/postgres?user=admin`
- `jdbc:aws-dsql:postgresql://your-cluster.dsql.us-east-1.on.aws/postgres?user=admin&token-duration-secs=14400`
- `jdbc:aws-dsql:postgresql://your-cluster.dsql.us-east-1.on.aws/postgres?user=admin&profile=myprofile`

## Properties

| Parameter | Description | Default |
|-----------|-------------|---------|
| `user` | Determines the user for the connection and the token generation method used. Example: `admin` | - |
| `token-duration-secs` | Duration in seconds for cached tokens in long-lived connections | [Same as dsql sdk limit](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/SECTION_authentication-token.html) |
| `profile` | Used for instantiating a `ProfileCredentialsProvider` for token generation with the provided profile name | - |
| `database` | The database name to connect to | postgres |

## Troubleshooting

### Common Issues

1. **Connection Timeout**: Ensure your Aurora DSQL cluster is in `Active` status
2. **Authentication Errors**: Verify your AWS credentials are properly configured
3. **Permission Denied**: Ensure your IAM user/role has the necessary Aurora DSQL permissions


## Additional resources

- [Aurora DSQL JDBC Connector Documentation](https://github.com/awslabs/aurora-dsql-jdbc-connector/README.md)
- [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
- [pgJDBC Documentation](https://jdbc.postgresql.org/documentation/)
- [AWS SDK for Java Documentation](https://docs.aws.amazon.com/sdk-for-java/)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
