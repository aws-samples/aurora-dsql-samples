# SQLAlchemy with Aurora DSQL

## Overview

This code example demonstrates how to use SQLAlchemy with Amazon Aurora DSQL. The example shows you how to
connect to an Aurora DSQL cluster with SQLAlchemy using Psycopg2, create entities, and read and write to those entity tables.

Aurora DSQL is a distributed SQL database service that provides high availability and scalability for
your PostgreSQL-compatible applications. SQLAlchemy is a popular object-relational mapping framework for Python that allows
you to persist Python objects to a database while abstracting the database interactions.

> **Note**
>
> Note that SQLAlchemy with Psycopg3 does not work with Aurora DSQL. SQLAlchemy with Psycopg3 uses nested transactions which rely on savepoints as part of the connection setup. Savepoints are not supported by Aurora DSQL.

## About the code example

The example demonstrates a flexible connection approach that works for both admin and non-admin users:

* When connecting as an **admin user**, the example uses the `public` schema and generates an admin authentication
  token.
* When connecting as a **non-admin user**, the example uses a custom `myschema` schema and generates a standard
  authentication token.

The code automatically detects the user type and adjusts its behavior accordingly.

## ⚠️ Important

* Running this code might result in charges to your AWS account.
* We recommend that you grant your code least privilege. At most, grant only the
  minimum permissions required to perform the task. For more information, see
  [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege).
* This code is not tested in every AWS Region. For more information, see
  [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services).

## TLS connection configuration

This example uses direct TLS connections where supported, and verifies the server certificate is trusted. Verified SSL
connections should be used where possible to ensure data security during transmission.

* Driver versions following the release of PostgreSQL 17 support direct TLS connections, bypassing the traditional
  PostgreSQL connection preamble
* Direct TLS connections provide improved connection performance and enhanced security
* Not all PostgreSQL drivers support direct TLS connections yet, or only in recent versions following PostgreSQL 17
* Ensure your installed driver version supports direct TLS negotiation, or use a version that is at least as recent as
  the one used in this sample
* If your driver doesn't support direct TLS connections, you may need to use the traditional preamble connection instead

## Run the example

### Prerequisites

* You must have an AWS account, and have your default credentials and AWS Region
  configured as described in the
  [Globally configuring AWS SDKs and tools](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html)
  guide.
* [Python 3.8.0](https://www.python.org/) or later.
* You must have an Aurora DSQL cluster. For information about creating an Aurora DSQL cluster, see the
  [Getting started with Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html)
  guide.
* If connecting as a non-admin user, ensure the user is linked to an IAM role and is granted access to the `myschema`
  schema. See the
  [Using database roles with IAM roles](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/using-database-and-iam-roles.html)
  guide.

### Download the Amazon root certificate from the official trust store

Download the Amazon root certificate from the official trust store:

```
wget https://www.amazontrust.com/repository/AmazonRootCA1.pem -O root.pem
```

### Set up environment for examples

1. Create and activate a Python virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate  # Linux, macOS
# or
.venv\Scripts\activate     # Windows
```

2. Install the required packages for running the examples:

```bash
pip install "psycopg2-binary>=2.9"
pip install "sqlalchemy"
pip install "boto3>=1.35.74"
```

### Run the code

The example demonstrates the following operations:

- Opening a connection pool to an Aurora DSQL cluster using a SQLAlchemy 
- Creating several SQLAlchemy entities
- Creating and querying objects that are persisted in DSQL

The example is designed to work with both admin and non-admin users:

- When run as an admin user, it uses the `public` schema
- When run as a non-admin user, it uses the `myschema` schema

**Note:** running the example will use actual resources in your AWS account and may incur charges.

Set environment variables for your cluster details:

```bash
# e.g. "admin"
export CLUSTER_USER="<your user>"

# e.g. "foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws"
export CLUSTER_ENDPOINT="<your endpoint>"

# e.g. "us-east-1"
export REGION="<your region>"
```

Run the example:

```bash
python src/example.py
```

The example contains comments explaining the code and the operations being performed.

## SQLAlchemy Pet Clinic with DSQL

### Connect to an Aurora DSQL cluster

The example below shows how to create an Aurora DSQL engine in SQLAlchemy and connect to a cluster. It handles token generation,
creating a new token for each connection to DSQL. This ensures that the token is always valid. This is done using SQLAlchemy's
event annotation to create a listener to the engine that creates a new token when connections are created.

```py
import os
import boto3
from sqlalchemy import create_engine, select, event
from sqlalchemy.engine import URL

def create_dsql_engine():
    cluster_user = os.environ.get("CLUSTER_USER", None)
    assert cluster_user is not None, "CLUSTER_USER environment variable is not set"

    cluster_endpoint = os.environ.get("CLUSTER_ENDPOINT", None)
    assert cluster_endpoint is not None, "CLUSTER_ENDPOINT environment variable is not set"

    region = os.environ.get("REGION", None)
    assert region is not None, "REGION environment variable is not set"

    client = boto3.client("dsql", region_name=region)

    # Create the URL, note that the password token is added when connections are created.
    url = URL.create(
        "postgresql", 
        username=cluster_user, 
        host=cluster_endpoint, 
        database="postgres"
    )
    
    # Create the engine
    engine = create_engine(
        url, 
        connect_args={"sslmode": "verify-full", "sslrootcert": "./root.pem"},
    )
    
    # Adds a listener that creates a new token every time a new connection is created in the SQLAlchemy engine
    @event.listens_for(engine, "do_connect")
    def add_token_to_params(dialect, conn_rec, cargs, cparams):
        # Generate a fresh token for this connection
        fresh_token = generate_token(client, cluster_user, cluster_endpoint, region)        
        # Update the password in connection parameters
        cparams["password"] = fresh_token

    # If we are using the non-admin user, we need to set the search path to use 'myschema' instead of public whenever a connection is created.
    @event.listens_for(engine, "connect", insert=True)
    def set_search_path(dbapi_connection, connection_record):
        if cluster_user == ADMIN: return
        existing_autocommit = dbapi_connection.autocommit
        dbapi_connection.autocommit = True
        cursor = dbapi_connection.cursor()
        cursor.execute("SET SESSION search_path='%s'" % NON_ADMIN_SCHEMA)
        cursor.close()
        dbapi_connection.autocommit = existing_autocommit

    return engine

def generate_token(client, cluster_user, cluster_endpoint, region):
    if (cluster_user == ADMIN):
        return client.generate_db_connect_admin_auth_token(cluster_endpoint, region)
    else:
        return client.generate_db_connect_auth_token(cluster_endpoint, region)
```

#### Connection Pooling
In SQLAlchemy, [connection pooling](https://docs.sqlalchemy.org/en/20/core/pooling.html#connection-pool-configuration) is 
enabled by default when the engine is created and each engine is automatically associated with a connection pool. 
In the example above, a new token is created for each connection opened in the connection pool. Note that DSQL connections
will automatically close after one hour. The connection pool will open new connections as needed.

### Create models

#### Using UUID as Primary Key

DSQL does not support serialized primary keys or identity columns (auto-incrementing integers) that are commonly used in traditional relational databases. Instead, it is recommended to use UUID (Universally Unique Identifier) as the primary key for your entities.

Here's how to define a UUID primary key in your entity class:
```py
    id = Column("id", UUID, primary_key=True, default=text('gen_random_uuid()'))
```

#### Model definitions

```py
from sqlalchemy import String
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.orm import relationship
from sqlalchemy import Column, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import text

class Base(DeclarativeBase):
    pass

# Define a Owner table
class Owner(Base):
    __tablename__ = "owner"
    
    id = Column(
                "id", UUID, primary_key=True, default=text('gen_random_uuid()')
            )
    name = Column("name", String(30), nullable=False)
    city = Column("city", String(80), nullable=False)
    telephone = Column("telephone", String(20), nullable=True, default=None)

# Define a Pet table
class Pet(Base):
    __tablename__ = "pet"
    
    id = Column(
                "id", UUID, primary_key=True, default=text('gen_random_uuid()')
            )
    name = Column("name", String(30), nullable=False)
    birth_date = Column("birth_date", Date(), nullable=False)
    owner_id = Column(
                "owner_id", UUID, nullable=True
    )
    # One to many
    owner = relationship("Owner", foreign_keys=[owner_id], primaryjoin="Owner.id == Pet.owner_id")

# Define an association table for Vet and Specialty, this is an intermediate table
# that lets us define the many-to-many mapping
class VetSpecialties(Base):
    __tablename__ = "vetSpecialties"
    
    id = Column(
                "id", UUID, primary_key=True, default=text('gen_random_uuid()')
            )
    vet_id = Column(
                "vet_id", UUID, nullable=True
    )
    specialty_id = Column(
                "specialty_id", String(80), nullable=True
    )

# Define a Specialty table
class Specialty(Base):
    __tablename__ = "specialty"
    id = Column(
                "name", String(80), primary_key=True
            )
    
# Define a Vet table
class Vet(Base):
    __tablename__ = "vet"
    
    id = Column(
                "id", UUID, primary_key=True, default=text('gen_random_uuid()')
            )
    name = Column("name", String(30), nullable=False)
    # Many-to-Many mapping
    specialties = relationship("Specialty", secondary=VetSpecialties.__table__,
        primaryjoin="foreign(VetSpecialties.vet_id)==Vet.id",
        secondaryjoin="foreign(VetSpecialties.specialty_id)==Specialty.id")
```

## Additional resources

* [Amazon Aurora DSQL Documentation](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/what-is-aurora-dsql.html)
* [SQLAlchemy Documentation](https://docs.sqlalchemy.org/en/20/)
* [Psycopg Documentation](https://www.psycopg.org/docs/)
* [AWS SDK for Python (Boto3) Documentation](https://boto3.amazonaws.com/v1/documentation/api/latest/index.html)
---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: MIT-0
