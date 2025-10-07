# Aurora DSQL with Spring Boot

## Overview

This example demonstrates how to connect to Aurora DSQL using Spring Boot with HikariCP connection pooling. The example
shows you how to connect to an Aurora DSQL cluster and perform basic database operations.

Aurora DSQL is a distributed SQL database service that provides high availability and scalability for
your PostgreSQL-compatible applications.

## About the code example

The example demonstrates a flexible connection approach that works for both admin and non-admin users:

* When connecting as an **admin user**, the example uses the `public` schema and generates an admin authentication
  token.
* When connecting as a **non-admin user**, the example uses a custom `myschema` schema and generates a standard
  authentication token.

The code automatically detects the user type and adjusts its behavior accordingly.

## ⚠️ Important

* Running this code might result in charges to your AWS account.
* We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
* This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

## TLS connection configuration

This example uses direct TLS connections where supported, and verifies the server certificate is trusted. Verified SSL
connections should be used where possible to ensure data security during transmission.

* Driver versions following the release of PostgreSQL 17 support direct TLS connections, bypassing the traditional
  PostgreSQL connection preamble
* Direct TLS connections provide improved connection performance and enhanced security
* Not all PostgreSQL drivers support direct TLS connections yet, or only in recent versions following PostgreSQL 17
* Ensure your installed driver version supports direct TLS negotiation, or use a version that is at least as recent as
  the one used in this sample
* If your driver doesn't support direct TLS connections, you may need to use the traditional preamble connection instead

## Run the example

### Prerequisites

* You must have an AWS account, and have your default credentials and AWS Region
  configured as described in the
  [Globally configuring AWS SDKs and tools](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html)
  guide.
* Java Development Kit (JDK): Ensure you have JDK 17+ installed.

  To verify Java is installed, run:

   ```bash
   java -version
   ```

* Build Tool (Maven or Gradle)
    - _Maven_: Ensure Maven is installed if that is your preferred option. You can download it from
      the [official website](https://maven.apache.org/download.cgi).
    - _Gradle_: A Gradle wrapper is included with the example. If you prefer to use a system installation of Gradle, you
      can download it from the [official website](https://gradle.org/install/).
* AWS SDK: Ensure that you set up the latest version of the AWS Java
  SDK from the [official website](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/setup.html).
* You must have an Aurora DSQL cluster. For information about creating an Aurora DSQL cluster, see the
  [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)
  guide.
* If connecting as a non-admin user, ensure the user is linked to an IAM role and is granted access to the `myschema`
  schema. See the
  [Using database roles with IAM roles](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/using-database-and-iam-roles.html)
  guide.

### Configuration

Set the following environment variables:

```bash
# e.g. "admin"
export CLUSTER_USER="<your user>"
  
# e.g. "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"
export CLUSTER_ENDPOINT="<your endpoint>"

# e.g. "us-east-1"
export REGION="<your region>"

# Optional: Only necessary if you want the application to exit after running the
# example code instead of continuing to serve the HTTP API.
export EXIT_AFTER_TEST="true"
```

### Run the code

The example demonstrates the following operations:

- Opening a connection to an Aurora DSQL cluster
- Creating a table
- Inserting and querying data

The example is designed to work with both admin and non-admin users:

- When run as an admin user, it uses the `public` schema
- When run as a non-admin user, it uses the `myschema` schema

**Note:** running the example will use actual resources in your AWS account and may incur charges.

**Using Maven:**

```bash
mvn spring-boot:run
```

**Using Gradle:**

```bash
./gradlew bootRun
```

## Additional resources

- [Spring Boot Documentation](https://spring.io/projects/spring-boot)
- [Spring Data JDBC](https://spring.io/projects/spring-data-jdbc)
- [HikariCP](https://github.com/brettwooldridge/HikariCP)
- [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
- [AWS SDK for Java Documentation](https://docs.aws.amazon.com/sdk-for-java/)

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
