# AWS DSQL Sequelize code examples

## Overview

The code examples in this topic show you how to use Sequelize with AWS DSQL. 

## Run the examples

### Prerequisites

* [NodeJS 18.0.0 or later](https://nodejs.org/en) - You can verify your NodeJS installation with `node -v`

### Setup test running environment 

```sh
npm install
export CLUSTER_ENDPOINT='TODO'
```

### Run the example

```sh
# Use the account credentials dedicated for Sequelize
ada credentials update --role=Admin --account <TODO> --once
npm run dev
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: Apache-2.0