# AWS DSQL psycopg code examples

## Overview

The code examples in this topic show you how to use the psycopg work with AWS DSQL. 

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
ada credentials update --role=Admin --account 481665088575 --once
pytest test/test_example.py
```

## Examples

All examples are under test directory. The following table describes each test script.

| Test File | Description |
| -------------------- | ----------- |
| test_example.py | Show database table create, read, update and delete operation. |

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: Apache-2.0
