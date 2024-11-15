# AWS DSQL Node-Postgres code examples

## Overview

The code examples in this topic show you how to use the Ruby-pg work with AWS DSQL. 

## Run the examples

### Prerequisites

* Ruby version >=2.5 is needed

### Setup test running environment 

```sh
bundle install
```

### Run the example tests

```sh
# Needed if once if you do not have them already
# Use the account credentials dedicated for ruby
ada credentials update --role=Admin --account 864899869023 --once

# Download the amazon's root certificate from the official trust store
wget https://www.amazontrust.com/repository/AmazonRootCA1.pem -O root.pem

rspec
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: Apache-2.0
