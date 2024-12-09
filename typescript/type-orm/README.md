# Aurora DSQL TypeORM code examples

## Overview

The code examples in this topic show you how to use the TypeORM work with Aurora DSQL. 

## Run the examples

### Prerequisites

* node version >=18.0 is needed

### Setup test running environment 

```sh
npm install
```

### Run the example tests

```sh
# Use the account credentials dedicated for javascript
export CLUSTER_ENDPOINT="<your cluster endpoint>"
export REGION="<your cluster region>"
```

```sh
# The following 3 commands are needed only if this is your 
# first time running the application.
npm run build
npm run migrations-create-table
npm run migrations-run

# Run the tests
npm test
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: MIT-0
