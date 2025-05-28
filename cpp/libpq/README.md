# Aurora DSQL with libpq

## Overview

This code example demonstrates how to use the Libpq library to interact with Amazon Aurora DSQL (DSQL). The example shows you how
to connect to an Aurora DSQL cluster and perform basic database operations.

Aurora DSQL is a distributed SQL database service that provides high availability and scalability for
your PostgreSQL-compatible applications. Libpq is a popular PostgreSQL library that allows
you to interact with PostgreSQL databases using c/cpp code.

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
* You must have an Aurora DSQL cluster. For information about creating an Aurora DSQL cluster, see the
  [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)
  guide.
* If connecting as a non-admin user, ensure the user is linked to an IAM role and is granted access to the `myschema`
  schema. See the
  [Using database roles with IAM roles](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/using-database-and-iam-roles.html)
  guide.

### Download the Amazon root certificate from the official trust store

Download the Amazon root certificate from the official trust store:

```
wget https://www.amazontrust.com/repository/AmazonRootCA1.pem -O root.pem
```

#### C++ compiler 
A c++ compiler that supports c++11 standard or newer.

#### AWS SDK for C++
The AWS SDK for C++ installed

- The instructions how to get and install the sdk can be found in the [Official site](https://docs.aws.amazon.com/sdk-for-cpp/v1/developer-guide/welcome.html)
- The path to the AWS SDK libraries and include files will need to be specified for compilation
- The path to the AWS SDK libraries will need to be specified for execution

**Note**
If you're building the SDK from source and you only need it for dsql you may use the -DBUILD_ONLY="dsql" flag to avoid building the entire sdk.
For example:

```
cmake <your_path>/aws-sdk-cpp -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=<your_path_to_aws-sdk-install> -DBUILD_ONLY="dsql"

# Note: Follow build and installation instructions on the official website. 
# This example is meant to point to the -DBUILD_ONLY="dsql" flag.
```

#### Libpq library and Postgres include files

- The path to the Libpq library and include files will need to be specified for compilation
- The path to the Libpq library will need to be specified for execution
- Obtaining Libpq library
    - It is installed with postgres installation. Therefore, if postgres is installed on the system the libpq is present in ../postgres_install_dir/lib, ../postgres_install_dir/include
    - It is installed when psql client program is installed, similarly as with postgres installation
    - On some systems libpq can be installed through package manager (if the package exists for the system) e.g.
        ```
        sudo yum install libpq-devel
        ```
    - On Mac libpq can be installed using brew
        ```
        brew install libpq
        ```
    - The [official website](https://www.postgresql.org/download/) may have a package for libpq or psql which bundles libpq
    - The last resort, build from source which also can be obtained from [official website](https://www.postgresql.org/ftp/source/) 


#### SSL Libraries

- SSL libraries need to be installed
- For example on Amazon Linux run these commands:
    ```
      sudo yum install -y openssl-devel 
      sudo yum install -y  openssl11-libs 
    ```
- On some systems the SSL libraries can be installed using package managers
    - They can be downloaded from the [official website](https://openssl-library.org/source/index.html)

### Build the example program

#### Edit the Makefile file

The Makefile is located in the libpq/src directory.

##### Location of the awd-sdk-cpp 

Update the following variables with the paths to the aws-sdk-cpp include and library files on your computer:

```
AWS_INC_DIR=-I <your_path_to_aws-sdk-install>/include
AWS_LIB_DIR=-L <your_path_to_aws-sdk-install>/lib
```

##### Linux 

Edit the variables specifying path to the postgres include files and path to the location of the libpq library.

Relace the /usr/local/pgsql/include and /usr/local/pgsql/lib with locations on your computer:

```
PG_INC_DIR=-I /usr/local/pgsql/include
LIBPQ_DIR=-L /usr/local/pgsql/lib
```

Note:

If you have the pg_config utility installed you can use the following commands to retrieve the above directories:

```
pg_config --includedir
pg_config --libdir
```

##### Mac 

The Mac related variables are in the 'Mac' section of the Makefile.
Edit the variables specifying path to the postgres include files and path to the location of the libpq library as well as the compiler include directory.

**Note:** These are examples only. Replace them with your path.

```
(x86)
PG_INC_DIR_MAC=-I /usr/local/opt/libpq/include
LIBPQ_DIR_MAC=-L /usr/local/opt/libpq/lib
OR
(brew)
PG_INC_DIR_MAC=-I /opt/homebrew/opt/postgresql@16/include
LIBPQ_DIR_MAC=-L /opt/homebrew/opt/postgresql@16/lib

COMPILER_INC_DIR_MAC=-I /Library/Developer/CommandLineTools/SDKs/MacOSX14.x.sdk/usr/include/c++/v1

# or could be 

COMPILER_INC_DIR_MAC=-I /Library/Developer/CommandLineTools/SDKs/MacOSX15.x.sdk/usr/include/c++/v1

```

#### Build the program

From the libpq/src directory run make command:

##### Linux

```
make libpq_example
```

#### Mac 

```
make libpq_example_mac
```

This should result in the **libpq_example** executable program

### Run the example program

**Note**
> To execute the example code, you need to have valid AWS Credentials configured (e.g. AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN)

#### Set environment variables specifying the location of the libpq and aws sdk libraries

Run the commands below.
Replace the paths in the commands below with the path on your computer.

##### Linux

```
export LD_LIBRARY_PATH="/usr/local/pgsql/lib:$LD_LIBRARY_PATH"
export LD_LIBRARY_PATH="<your_path_to_aws-sdk-install>/lib:$LD_LIBRARY_PATH"
```

##### Mac

```
export DYLD_FALLBACK_LIBRARY_PATH=<your_path_to_aws-sdk-install>/lib
```

#### Set environment variables specifying cluster endpoint and region

```
# e.g. 'admin' or a custom user 
export CLUSTER_USER=<your cluster user> 

# e.g. "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"
export CLUSTER_ENDPOINT="<your cluster endpoint>"

# e.g. "us-east-1"
export REGION="<your cluster region>"
```

#### Run the example program

From the libpq/src directory run:

```
./libpq_example
```

### Troubleshooting

#### SSL support in libpq

Aurora DSQL requires SSL when connecting to it. Therefore, the libpq library must have been built with SSL support.

If this is not the case, you may see the following error message while executing the libpq_example program:

>
>Error while connecting to the database server: sslmode value "require" invalid when SSL support is not compiled in.

Hopefully, the libpq library that is distributed with PostgreSQL installation as well as through package managers has the SSL built in. 

It may not be the case if you've built it yourself from sources. In this case make sure to include the SSL when building.

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0