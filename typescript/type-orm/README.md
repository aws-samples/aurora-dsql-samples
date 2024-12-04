# AWS DSQL TypeORM code examples

## Overview

The code examples in this topic show you how to use TypeORM with AWS DSQL. 

## Run the examples

### Prerequisites

* [NodeJS 18.0.0 or later](https://nodejs.org/en) - You can verify your NodeJS installation with `node -v`

### Setup test running environment 

```sh
npm install
```

### Run the example

```sh
# Use the account credentials dedicated for TypeORM
export CLUSTER_ENDPOINT="<your cluster endpoint>"
export REGION="<your cluster region>"

# If this is your first time running the example, the following two commands
# are needed. They are not needed in consecutive runs
npm run migrations-create-table
npm run migrations-run

# Run the examples
npm run dev
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: Apache-2.0