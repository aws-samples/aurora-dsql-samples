# Aurora DSQL Libpq code examples

## Overview

The code examples in this topic show you how to use the Libpq with Aurora DSQL. 

## Prerequisites

Please see the prerequisites section in README.md document.

## Run the examples

### Build the example program

#### Edit the Makefile file

##### Linux 

In the Makefile located in the libpq/src directory edit the variables specifying path to the postgres include files and path to the location of the libpq library.

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

The Mac related variables are in the 'Mac' section of the make file.
If necessary, adjust the directory locations. 
For example:

```
COMPILER_INC_DIR_MAC=-I /Library/Developer/CommandLineTools/SDKs/MacOSX14.5.sdk/usr/include/c++/v1

# could be 

COMPILER_INC_DIR_MAC=-I /Library/Developer/CommandLineTools/SDKs/MacOSX15.5.sdk/usr/include/c++/v1
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

This should result in the libpq_example executable program

### Run the example program

**Note**
> To execute the example code, you need to have valid AWS Credentials configured (e.g. AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN)

#### Set environment variables specifying the location of the libpq and aws sdk libraries

Run the commands below.
Replace the paths in the commands below with the path on your computer.

##### Linux

```
export LD_LIBRARY_PATH="/usr/local/pgsql/lib:$LD_LIBRARY_PATH"
export LD_LIBRARY_PATH="<your_path>/aurora-dsql-samples/cpp/example_code/libpq/sdk/lib:$LD_LIBRARY_PATH"
```

##### Mac

```
export DYLD_FALLBACK_LIBRARY_PATH=<your_path>/aurora-dsql-samples/cpp/example_code/libpq/sdk/mac_x64_lib
```

#### Set environment variables specifying cluster endpoint and region

```
export CLUSTER_ENDPOINT="<your cluster endpoint>"
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

If this is not the case, you may see the following error messgage while executing the libpq_example program:

>
>Error while connecting to the database server: sslmode value "require" invalid when SSL support is not compiled in.

Hopefully, the libpq library that is distributed with PostgreSQL installation as well as through package managers has the SSL built in. 

It may not be the case if you've built it yourself from sources. In this case make sure to include the SSL when building.

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
