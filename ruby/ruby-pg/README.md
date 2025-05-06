# Ruby-pg with Aurora DSQL

## Overview

This code example demonstrates how to use Ruby-pg to interact with Amazon Aurora DSQL (DSQL). The example shows you how
to connect to an Aurora DSQL cluster and perform basic database operations.

Aurora DSQL is a distributed SQL database service that provides high availability and scalability for
your PostgreSQL-compatible applications. Ruby-pg is a popular PostgreSQL adapter for Ruby that allows
you to interact with PostgreSQL databases using Ruby code.

## About the code example

The example demonstrates a flexible connection approach that works for both admin and non-admin users:

* When connecting as an **admin user**, the example uses the `public` schema and generates an admin authentication
  token.
* When connecting as a **non-admin user**, the example uses a custom `myschema` schema and generates a standard
  authentication token. The `myschema` schema needs to be created prior to running the example and the **non-admin user** needs to be granted access to the schema.

The code automatically detects the user type and adjusts its behavior accordingly.
The example contains comments explaining the code and the operations being performed.

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
* You must have an Aurora DSQL cluster. For information about creating an Aurora DSQL cluster, see the
  [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)
  guide.
* If connecting as a non-admin user, ensure the user is linked to an IAM role and is granted access to the `myschema`
  schema. See the
  [Using database roles with IAM roles](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/using-database-and-iam-roles.html)
  guide.


### Driver Dependencies

Before using the Ruby-pg driver, ensure you have the following prerequisites installed:
Ruby: Ensure you have ruby v3+ installed from the [official website](https://www.ruby-lang.org/en/documentation/installation/).

Verify install

```bash
ruby --version
```

### Libpq library

Libpq is required by Ruby-pg

#### Obtaining the libpq library

- It is installed with postgres installation. Therefore, if postgres is installed on the system the libpq is present in ../postgres_install_dir/lib, ../postgres_install_dir/include
- It is installed when psql client program is installed, similarily as with postgres installation. 
- On some systems libpq can be installed through package manager  e.g.
  - On Amazon Linux
    ```
    sudo yum install libpq-devel
    ```
  - On Mac libpq can be installed using brew
    ```
    brew install libpq
    ```
- The [official website](https://www.postgresql.org/download/) may have a package for libpq or psql (which bundles libpq)
- Ultimately, build from source which also can be obtained from [official website](https://www.postgresql.org/ftp/source/) 

#### Add libpq to PATH

In some cases, it may be necessary to add the location of the libpq/bin directory to PATH 

```
export PATH="$PATH:<your installed location>/libpq/bin"
```

### Install Ruby-pg, Aurora DSQL SDK and other required dependencies

- All the required dependencies are present in the `Gemfile` file. To get all the required dependencies, run the following command from the directory where the `Gemfile` is present.

```bash
bundle install
```

### Download the Amazon root certificate from the official trust store

Download the Amazon root certificate from the official trust store.
This example shows one of the available certs that can be used by the client.
Other certs such as AmazonRootCA2.pem, AmazonRootCA3.pem, etc. can also be used.

```
wget https://www.amazontrust.com/repository/AmazonRootCA1.pem -O root.pem
```

Place the root.pem file in the same directory as the hello_dsql.rb example file or modify the path to it in the example file.

### Set the environmet variables specifying cluster endpoint, region and cluster user 

```
# e.g. 'admin' or a custom user 
export CLUSTER_USER=<your cluster user> 

# e.g. "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"
export CLUSTER_ENDPOINT="<your cluster endpoint>"

# e.g. "us-east-1"
export REGION="<your cluster region>" 
```

### Run the example 

Execute the following command:

```
ruby hello_dsql.rb
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: MIT-0
