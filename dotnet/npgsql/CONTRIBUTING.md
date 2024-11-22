# AWS DSQL .NET code examples

## Overview

The code examples in this topic show you how to use the .NET work with AWS DSQL. 

## Run the examples

### Prerequisites

* dotnet version >=8.0.0 is needed

### Setup test running environment 

```sh
dotnet add package Npgsql --version 8.0.5
dotnet add package AWSSDK.Core --version 4.0.0-preview
dotnet add package AWSSDK.SecurityToken --version 4.0.0-preview
dotnet add package xunit --version 2.9.2
```

### Run the example tests

```sh
# Use the account credentials dedicated for dotnet
ada credentials update --role=Admin --account 816069133683 --once
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
