# Aurora DSQL Java PgJDBC code examples

## Overview

The code examples in this topic show you how to use the Java PgJDBC to work with Aurora DSQL. 

## Run the examples

### Prerequisites

* java version >= 17 is needed

### Run the example tests

```sh
# Use the account credentials dedicated for javascript
export CLUSTER_ENDPOINT="<your cluster endpoint>"
export REGION="<your cluster region>"
mvn test
```

#### Gradle

```sh
export CLUSTER_ENDPOINT="<your cluster endpoint>"
export REGION="<your cluster region>"
gradle wrapper

./gradlew run
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: MIT-0