# Psycopg2 with Aurora DSQL

## Table of Contents

1. Prerequisites
2. Setup test running environment
3. Connect to a cluster
4. Execute Examples
   1. SQL CRUD Examples

## Prerequisites

* You must have an AWS account, and have your default credentials and AWS Region configured as described in the 
[AWS Tools and SDKs Shared Configuration and Credentials Reference Guide](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html).
* [Python 3.8.0 or later](https://www.python.org/) -  You can verify your Python installation with `python3 -V` 
* You must have already provisioned a Aurora DSQL cluster following the [user guide](TBD)

## Setup test running environment 

1. Amazon DSQL python SDK is required to run psycopg2 with DSQL. Following [DSQL user guide](https://alpha.www.docs.aws.a2z.com/distributed-sql/latest/userguide/accessing-install-sdk.html) for python SDK installation.

2. Install the necessary packages using the following command:

```sh
pip3 install "psycopg2-binary>=2.9"
```

## Connect to a cluster

```py
import psycopg2>=2.9
import boto3

# Returns the connection object
def connect_to_cluster(cluster_endpoint, region):
    client = boto3.client("axdbfrontend", region_name=region)
    # "DbConnect" action with a non-superuser can also be used
    # The token expiration time is optional, and the default value 900 seconds
    password_token = client.generate_db_auth_token(cluster_endpoint, "DbConnectSuperuser", region)

    # connection parameters
    dbname = "dbname=postgres"
    user = "user=admin"
    host = f'host={cluster_endpoint}'
    sslmode = "sslmode=require"
    password = f'password={password_token}'

    # Make a connection to the cluster
    conn = psycopg2.connect('%s %s %s %s %s' % (dbname, user, host, sslmode, password))

    conn.set_session(autocommit=True)
    return conn

def generate_token(cluster_endpoint, region):
    client = boto3.client("axdbfrontend", region_name=region)
    return client.generate_db_auth_token(cluster_endpoint, "DbConnectSuperuser", region)
```

## Execute Examples

### SQL CRUD Examples

```py
def crud():
    cluster_endpoint = 'abcdefghijklmnopqrst123456.c0001.us-east-1.prod.sql.axdb.aws.dev'
    region = 'us-east-1'
    conn = connect_to_cluster(cluster_endpoint, region)
    try: 
        create_table(conn)
        insert_data(conn)
        fetch_data(conn)
        update_data(conn)
        delete_data(conn)
    finally:
        conn.close()

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

def insert_data(conn):
    cur = conn.cursor()
    cur.execute("insert into owner(name, city, telephone) values('Andrew', 'vancouver', '6239087654')")
    cur.execute("insert into owner(name, city) values('Charles', 'richmond')")
    cur.execute("insert into owner(name, city, telephone) values('Zoya', 'langley', '6230005678')")

def fetch_data(conn):
    cur = conn.cursor()
    cur.execute("select * from owner where name='Andrew'")
    row = cur.fetchone()
    # Verify that the result we got is what we inserted before
    assert row[0] is not None
    assert row[1] == "Andrew"
    assert row[2] == "vancouver"
    assert row[3] == "6239087654"

def update_data(conn):
    cur = conn.cursor()
    cur.execute("update owner set telephone='7811230000' where name='Andrew'")
    cur.execute("select telephone from owner where name='Andrew'")
    # Select the updated telephone number for the owner 'Andrew'
    assert cur.fetchone()[0] == "7811230000"

def delete_data(conn):
    cur = conn.cursor()
    cur.execute("delete from owner where telephone='7811230000'")
    cur.execute("select * from owner where telephone='7811230000'")
    assert not cur.fetchone()
```

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: Apache-2.0
