# Aurora DSQL SQLAlchemy code examples

## Overview

The code examples in this topic show you how to use the SQLAlchemy work with Aurora DSQL. 

## Run the examples

### Prerequisites

* python version >=3.8.0 is needed

### Setup test running environment 

```sh
source setup.sh
```

### Run the example tests

```sh
# Use the account credentials dedicated for python
export CLUSTER_ENDPOINT="<your cluster endpoint>"
export REGION="<your cluster region>"
pytest test/
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: MIT-0
