# Aurora DSQL with SQLAlchemy

## Overview

This code example demonstrates how to use SQLAlchemy with Amazon Aurora DSQL. The example shows you how to connect to an Aurora DSQL cluster with SQLAlchemy using the Aurora DSQL Python Connector, define ORM models, and perform CRUD operations.

Aurora DSQL is a distributed SQL database service that provides high availability and scalability for your PostgreSQL-compatible applications. SQLAlchemy is a popular Python SQL toolkit and ORM that provides a full suite of well-known enterprise-level persistence patterns.

## About the code example

This example uses the [Aurora DSQL Python Connector](https://github.com/awslabs/aurora-dsql-connectors/tree/main/python/connector) which automatically handles IAM token generation for authentication.

The example demonstrates a flexible connection approach that works for both admin and non-admin users:
* When connecting as an **admin user**, the example uses the `public` schema and generates an admin authentication token.
* When connecting as a **non-admin user**, the example uses a custom `myschema` schema and generates a standard authentication token.

The code automatically detects the user type and adjusts its behavior accordingly.

## ⚠️ Important
* Running this code might result in charges to your AWS account.
* We recommend that you grant your code least privilege. At most, grant only the minimum permissions required to perform the task. For more information, see [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
* This code is not tested in every AWS Region. For more information, see [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

## Run the example

### Prerequisites
* You must have an AWS account, and have your default credentials and AWS Region configured as described in the [Globally configuring AWS SDKs and tools](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html) guide.
* [Python 3.10](https://www.python.org/) or later.
* You must have an Aurora DSQL cluster. For information about creating an Aurora DSQL cluster, see the [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html) guide.
* If connecting as a non-admin user, ensure the user is linked to an IAM role and is granted access to the `myschema` schema. See the [Using database roles with IAM roles](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/using-database-and-iam-roles.html) guide.

### Set up environment for examples
1. Create and activate a Python virtual environment:
```
python3 -m venv .venv
source .venv/bin/activate
```
2. Install the required packages:
```
pip install -r requirements.txt
```

### Run the code

The example demonstrates the following operations:
* Connecting to Aurora DSQL using SQLAlchemy with IAM authentication
* Creating tables using SQLAlchemy's `Base.metadata.create_all()`
* Defining ORM models with UUID primary keys and application-level relationships
* Inserting and querying data with relationship loading (joinedload)

The example is designed to work with both admin and non-admin users:
* When run as an admin user, it uses the `public` schema
* When run as a non-admin user, it uses the `myschema` schema

**Note:** running the example will use actual resources in your AWS account and may incur charges.

Set environment variables for your cluster details:
```
# e.g. "admin"
export CLUSTER_USER="<your user>"

# e.g. "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"
export CLUSTER_ENDPOINT="<your endpoint>"
```

Run the example:
```
python -m src.example
```

Run the tests:
```
pytest
```

## Usage notes

### Connecting to DSQL

Aurora DSQL is PostgreSQL-compatible, so use the `postgresql+psycopg` dialect. The Aurora DSQL Python Connector handles IAM token generation automatically. Pass a connection creator to SQLAlchemy's `create_engine`.

Aurora DSQL does not support `SAVEPOINT`, which SQLAlchemy's psycopg dialect uses during initialization. Set `isolation_level="AUTOCOMMIT"` and `autocommit=True` on the connection to avoid this:

```python
import aurora_dsql_psycopg as dsql
from sqlalchemy import create_engine

engine = create_engine(
    "postgresql+psycopg://",
    creator=lambda: dsql.connect(host=endpoint, user=user, autocommit=True),
    isolation_level="AUTOCOMMIT",
    pool_recycle=3300,  # Recycle before DSQL's 1-hour connection limit
)
```

For non-admin users, set the search path using a connection event:

```python
from sqlalchemy import event

@event.listens_for(engine, "connect")
def set_search_path(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("SET search_path TO myschema")
    cursor.close()
```

### Primary keys

The SERIAL pseudo-type is not available in Aurora DSQL. Aurora DSQL supports [sequences and identity columns](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/sequences-identity-columns.html) (with `CACHE` specified), but UUIDs with `gen_random_uuid()` are the [recommended default](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/sequences-identity-columns-working-with.html) for primary keys:

```python
from uuid import UUID
from sqlalchemy import Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

id: Mapped[UUID] = mapped_column(
    Uuid, primary_key=True, server_default=text("gen_random_uuid()")
)
```

### Relationships without foreign key constraints

Aurora DSQL supports JOIN operations but does not enforce foreign key constraints. Do not use `ForeignKey()` in column definitions. Instead, define relationships using `relationship()` with explicit `primaryjoin` and `foreign()` annotations:

```python
from sqlalchemy.orm import relationship, foreign

class Owner(Base):
    __tablename__ = "owner"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))

class Pet(Base):
    __tablename__ = "pet"
    owner_id: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)

# Define after both classes exist
Owner.pets = relationship(Pet, primaryjoin=Owner.id == foreign(Pet.owner_id), back_populates="owner")
Pet.owner = relationship(Owner, primaryjoin=foreign(Pet.owner_id) == Owner.id, back_populates="pets")
```

The `foreign()` annotation tells SQLAlchemy which column is the "foreign" side of the join, replacing the role that `ForeignKey()` normally plays.

## Additional resources
* [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
* [Sequences and identity columns in Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/sequences-identity-columns.html)
* [Migrating from PostgreSQL to Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-migration-guide.html)
* [Aurora DSQL Python Connector](https://github.com/awslabs/aurora-dsql-connectors/tree/main/python/connector)
* [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

SPDX-License-Identifier: MIT-0
