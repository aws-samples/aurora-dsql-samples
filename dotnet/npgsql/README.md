# AWS DSQL .NET code examples

## Overview

The code examples in this topic show you how to use the .NET work with AWS DSQL. 

## Run the examples

### Prerequisites

* dotnet version >=8.0.0 is needed

### Run the example tests

```sh
# Use the account credentials dedicated for dotnet
export CLUSTER_ENDPOINT="<your cluster endpoint from us-east-1>"
cd ExampleTest.Tests
dotnet test
```

### Trouble-shooting
Below error on Cloud Desktop can be resolved by running `export DOTNET_NUGET_SIGNATURE_VERIFICATION=false`.
```
error NU3018: Package 'System.Runtime.InteropServices 4.3.0' from source 'https://api.nuget.org/v3/index.json': The repository primary signature's signing certificate is not trusted by the trust provider.
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: Apache-2.0
