# AWS DSQL CPP SDK code examples

## Overview

The code examples in this topic show you how to use the AWS CPP SDK with DSQL to create, read, update, and delete clusters.

## Run the examples

### Prerequisites

#### C++ compiler 
A c++ compiler that supports c++11 standard or newer.

#### AWS SDK for C++
The AWS SDK for C++ installed

- The instructions for how to get and install the sdk can be found in the [Official site](https://docs.aws.amazon.com/sdk-for-cpp/v1/developer-guide/welcome.html)
- The path to the AWS SDK libraries and include files will need to be specified for compilation.
- The path to the AWS SDK libraries will need to be specified for execution

**Note**
If you're building the SDK from source and you only need it for dsql you may use the -DBUILD_ONLY="dsql" flag to avoid building the entire sdk.
For example:

```
cmake ../aws-sdk-cpp -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH=/usr/local/ -DCMAKE_INSTALL_PREFIX=/usr/local/ -DBUILD_ONLY="dsql"
```

### Build the example program


#### Update paths in the Makefile

Open the Makefile in the cluster_management/src directory and modify the path to aws sdk include files 

```
AWS_INC_DIR=-I ../aws-sdk-install/include
```

and the path to aws sdk library files to match the path on your computer.

```
AWS_LIB_DIR=-L ../aws-sdk-install/lib
```

For Mac, depending on the location of the compiler files on your computer, you  may or may not need to modify this variable as well:

```
COMPILER_INC_DIR_MAC
```

#### Build the example program

From the cluster_management/src directory run make command:

##### Linux

```
make linux
```

##### Mac 

```
make mac 
```

This should result in the **example** executable program in the same directory.


### Setup test running environment 

Ensure you are authenticated with AWS credentials. 

#### Set environment variables specifying the location of the aws sdk libraries

##### Linux

```
export LD_LIBRARY_PATH="<your_path>/sdk/lib:$LD_LIBRARY_PATH"
```

##### Mac

```
export DYLD_FALLBACK_LIBRARY_PATH=<your_path>/sdk/lib:$DYLD_FALLBACK_LIBRARY_PATH
```

#### Run the example program

**Note**
> To execute the example code, you need to have valid AWS Credentials configured (e.g. AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN)

In a terminal run the following command from the cluster_management/src directory 

```
./example
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: Apache-2.0