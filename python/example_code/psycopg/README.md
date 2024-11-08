# Psycopg with Aurora DSQL

## Table of Contents

1. Prerequisites
2. Setup test running environment
3. Connect to a cluster
4. Execute Examples
   - SQL CRUD Examples

## Prerequisites

* You must have an AWS account, and have your default credentials and AWS Region configured as described in the 
[AWS Tools and SDKs Shared Configuration and Credentials Reference Guide](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html).
* [Python 3.8.0 or later](https://www.python.org/) - You can verify your Python installation with `python3 -V`
* AWS Xanadu python SDK is required to run psycopg with Xanadu. Following [Xanadu user guide](https://alpha.www.docs.aws.a2z.com/distributed-sql/latest/userguide/accessing-install-sdk.html) for python SDK installation. [TODO: update the link here with office link when the user guide is released]

## Setup test running environment 
1. On local environment, activate python virtual environment by running:
```
python3 -m venv psycopg_venv
source psycopg_venv/bin/activate
```

2. Install the needed packages using the following command:

```sh
pip install "psycopg[binary]>=3"
```

## Connect to a cluster

```py
import psycopg
import boto3

def connect_to_cluster(cluster_endpoint, region):
    client = boto3.client("axdbfrontend", region_name=region)
    # "DbConnect" action with a non superuser can also be used
    # The token expiration time is optional, and the default value 900 seconds
    password_token = client.generate_db_auth_token(cluster_endpoint, "DbConnectSuperuser", region)

    # connection parameters
    dbname = "dbname=postgres"
    user = "user=admin"
    host = f'host={cluster_endpoint}'
    sslmode = "sslmode=require"
    password = f'password={password_token}'

    # Make a connection to the cluster
    conn = psycopg.connect('%s %s %s %s %s' % (dbname, user, host, sslmode, password))

    conn.set_autocommit(True)
    return conn
```

## Execute Examples

### SQL CRUD Examples

> [!Important]
>
> To execute the example code, you need to have valid AWS Credentials configured (e.g. AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN)

#### 1. Create Owner Table

```py
import psycopg
import boto3

def create_table(conn):
    cur = conn.cursor()
    cur.execute(b"drop table if exists owner")
    cur.execute(b"""
        create table owner(
            id uuid not null DEFAULT gen_random_uuid(),
            name varchar(30) not null,
            city varchar(80) not null,
            telephone varchar(20) default null,
            primary key (id))"""
        )
    print('Created table owner')

```
#### 2. Create Owner

```py
import psycopg
import boto3

def insert_data(conn):
    cur = conn.cursor()
    cur.execute("insert into owner(name, city, telephone) values('Andrew', 'vancouver', '6239087654')")
    cur.execute("insert into owner(name, city) values('Charles', 'richmond')")
    cur.execute("insert into owner(name, city, telephone) values('Zoya', 'langley', '6230005678')")
    print('Inserted 3 rows into owner')
```

#### 3. Read Owner

```py
import psycopg
import boto3

def fetch_data(conn):
    cur = conn.cursor()
    cur.execute("select * from owner where name='Andrew'")
    row = cur.fetchone()
    print(f'Retrieved one row from owner: {row}')
    # Verify that the result we got is what we inserted before
    assert row[0] != None
    assert row[1] == "Andrew"
    assert row[2] == "vancouver"
    assert row[3] == "6239087654"
```

#### 4. Update Owner

```py
import psycopg
import boto3

def update_data(conn):
    cur = conn.cursor()
    cur.execute("update owner set telephone='7811230000' where name='Andrew'")
    cur.execute("select telephone from owner where name='Andrew'")
    # Select the updated telephone number for the owner 'Andrew'
    assert cur.fetchone()[0] == "7811230000"
    print('Updated one row in owner')
```

#### 5. Delete Owner

```py
import psycopg
import boto3

def delete_data(conn):
    cur = conn.cursor()
    cur.execute("delete from owner where telephone='7811230000'")
    cur.execute("select * from owner where telephone='7811230000'")
    assert not cur.fetchone()
    print('Deleted rows from owner')
```
---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: Apache-2.0
