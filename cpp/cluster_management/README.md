# Aurora DSQL CPP SDK code examples

## Overview

The code examples in this topic show you how to use the AWS CPP SDK with DSQL 
to create, read, update, and delete single- and multi-Region clusters.

Each *.cpp file in the src directory demonstrates a minimum working example for each operation. Each of the files can be independently compiled to produce an independent program that can be executed.
The Example.cpp invokes each individual operation to crate full examples of single- and multi-Region cluster lifecycles.

## Run the examples

### ⚠️ Important

* Running this code might result in charges to your AWS account.
* We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
* This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

### Prerequisites

#### C++ compiler 
A c++ compiler that supports c++11 standard or newer.

#### AWS SDK for C++
The AWS SDK for C++ installed

- The instructions for how to get and install the sdk can be found in the [Official site](https://docs.aws.amazon.com/sdk-for-cpp/v1/developer-guide/welcome.html)
- The path to the AWS SDK libraries and include files will need to be specified for compilation
- The path to the AWS SDK libraries will need to be specified for execution

**Note**
If you're building the SDK from source and you only need it for dsql you may use the -DBUILD_ONLY="dsql" flag to avoid building the entire sdk.
For example:

```
cmake <your_path>/aws-sdk-cpp -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=<your_path_to_aws-sdk-install> -DBUILD_ONLY="dsql"

# Note: Follow build and installation instructions on the official website. 
# This example is only meant to point to the -DBUILD_ONLY="dsql" flag.
```

### Build the example program

#### Update paths in the Makefile

Open the Makefile in the cluster_management/src directory and modify the path to aws sdk include files 

```
AWS_INC_DIR=-I <your_path_to_aws-sdk-install>/include
```

and the path to aws sdk library files to match the path on your computer.

```
AWS_LIB_DIR=-L <your_path_to_aws-sdk-install>/lib
```

For Mac, depending on the location of the compiler files on your computer, you may or may not need to modify this variable as well:

```
COMPILER_INC_DIR_MAC

e.g. 
COMPILER_INC_DIR_MAC=-I /Library/Developer/CommandLineTools/SDKs/MacOSX14.x.sdk/usr/include/c++/v1

# or 

COMPILER_INC_DIR_MAC=-I /Library/Developer/CommandLineTools/SDKs/MacOSX15.x.sdk/usr/include/c++/v1
```

#### Build the example program

From the cluster_management/src directory run the following make command:

##### Linux

```
make linux_example
```

##### Mac 

```
make mac_example
```

This should result in the **example** executable program in the same directory.


#### Build the programs demonstrating individual operations

Each .cpp file, in addition to the full Example.cpp, in the src directory demonstrates a minimum working example for each operation. Each of the files can be independently compiled to produce an independent program that can be executed.

**Note**
Each of the *.cpp files illustrating a single operation contains the main() function. 
However, the main() functions are wrapped around a conditional compilation variables like this:

```
//#define STANDALONE_MODE
#ifdef STANDALONE_MODE
int main() {}
#endif // STANDALONE_MODE
```

In order to build the individual examples, open the corresponding .cpp file, and uncomment this line:

```
//#define STANDALONE_MODE
```

Then build the programs as follows

##### Linux

```
# to build all the small programs
make linux_all

# to build a specific one run make corresponding to that operation, e.g. 
# to build CreateMultiRegion.cpp
make linux_create_multi

# to build UpdateCluster.cpp
make linux_update
```

##### Mac 

```
# to build all the small programs
make mac_all

# to build a specific one run make corresponding to that operation, e.g. 
# to build CreateMultiRegion.cpp
make mac_create_multi

# to build UpdateCluster.cpp
make mac_update
```


### Setup test running environment 

Ensure you are authenticated with AWS credentials. 

#### Set environment variables specifying the location of the aws sdk libraries

##### Linux

```
export LD_LIBRARY_PATH="<your_path_to_aws-sdk-install>/lib:$LD_LIBRARY_PATH"
```

##### Mac

```
export DYLD_FALLBACK_LIBRARY_PATH=<your_path_to_aws-sdk-install>/lib:$DYLD_FALLBACK_LIBRARY_PATH
```

#### (Optional) Set Region environment variables

```
# Used in single and multi-region scenario. Defaults to 'us-east-1'
export CLUSTER_1_REGION="<your region 1>"

# Used multi-region scenario. Defaults to 'us-east-2'
export CLUSTER_2_REGION="<your region 2>"

# Used in multi-region scenario. Defaults to 'us-west-2'
export WITNESS_REGION="<your witness region>"
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

SPDX-License-Identifier: MIT-0