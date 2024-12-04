# Aurora DSQL Ruby-pg code examples

## Overview

The code examples in this topic show you how to use the Ruby-pg work with Aurora DSQL. 

## Run the examples

### Prerequisites

* Ruby version >=2.5 is needed
* AWS credentials file is configured


### Setup test running environment 

```sh

bundle install

```

### Run the example tests

```sh
# Use the account credentials dedicated for ruby

# Download the Amazon root certificate from the official trust store
# This example shows one of the available certs that can be used by the client;
# other certs such as AmazonRootCA2.pem, AmazonRootCA3.pem, etc. can also be used.
wget https://www.amazontrust.com/repository/AmazonRootCA1.pem -O root.pem

export CLUSTER_ENDPOINT="<your cluster endpoint>"
export REGION="<your cluster region>"

rspec
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: MIT-0
