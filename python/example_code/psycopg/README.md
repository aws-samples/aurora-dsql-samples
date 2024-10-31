# How to connect to DSQL and execute queries using Psycopg

## Overview

The code examples in this topic will show you how to use Psycopg with Amazon Distributed SQL. 

## Run the examples

### Prerequisites

* You must have an AWS account, and have your default credentials and AWS Region configured as described in the 
[AWS Tools and SDKs Shared Configuration and Credentials Reference Guide](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html).
* [Python 3.8.0 or later](https://www.python.org/) - You can verify your Python installation with `python3 -V`
* AWS Xanadu python SDK is required to run psycopg with Xanadu. Following [Xanadu user guide](https://alpha.www.docs.aws.a2z.com/distributed-sql/latest/userguide/accessing-install-sdk.html) for python SDK installation. [TODO: update the link here with office link when the user guide is released]

### Setup test running environment 
1. On local environment, activate python virtual environment by running:
```
python3 -m venv psycopg_venv
source psycopg_venv/bin/activate
```

2. Install the needed packages using the following command:

```sh
pip install "psycopg[binary]>=3"
```

### Connect to a cluster

```py
import psycopg
import boto3

# Returns the connection object
def connect_to_cluster(cluster_endpoint, region):
    client = boto3.client("axdbfrontend", region_name=region)
    # "DbConnect" action with a non superuser can also be used
    password_token = client.generate_db_auth_token(cluster_endpoint, "DbConnectSuperuser", region)

    # connection parameters
    dbname = "dbname=postgres"
    user = "user=axdb_superuser"
    host = f'host={cluster_endpoint}'
    sslmode = "sslmode=require"
    password = f'password={password_token}'

    # Make a connection to the cluster
    conn = psycopg.connect('%s %s %s %s %s' % (dbname, user, host, sslmode, password))

    conn.set_autocommit(True)
    return conn
```

## Create a table, insert, update and delete rows

```py
import psycopg
import boto3

def crud():
    cluster_endpoint = 'abcdefghijklmnopqrst123456.c0001.us-east-1.prod.sql.axdb.aws.dev'
    region = 'us-east-1'
    conn = connect_to_cluster(cluster_endpoint, region)
    try:
        # Create a table
        conn.pgconn.exec_(b"drop table if exists owner")
        conn.pgconn.exec_(b"""
            create table owner(
                id uuid not null DEFAULT gen_random_uuid(),
                name varchar(30) not null,
                city varchar(80) not null, 
                telephone varchar(20) default null,
                primary key (id))"""
            )
        
        cur = conn.cursor()
                
        # Insert some rows
        cur.execute("insert into owner(name, city, telephone) values('Andrew', 'vancouver', '6239087654')")
        cur.execute("insert into owner(name, city) values('Charles', 'richmond')")
        cur.execute("insert into owner(name, city, telephone) values('Zoya', 'langley', '6230005678')")
        
        # Read a row
        cur.execute("select * from owner where name='Andrew'").fetchone()
        
        # Verify that the result we got is what we inserted before
        assert cur.pgresult.get_value(0, 0) != None
        assert cur.pgresult.get_value(0, 1) == b"Andrew"
        assert cur.pgresult.get_value(0, 2) == b"vancouver"
        assert cur.pgresult.get_value(0, 3) == b"6239087654"
        
        # Update a row
        cur.execute("update owner set telephone='7811230000' where name='Andrew'")
        cur.execute("select telephone from owner where name='Andrew'")
        # Select the updated telephone number for the owner 'Andrew'
        assert cur.pgresult.get_value(0, 0) == b"7811230000"
        
        # Delete a row
        cur.execute("delete from owner where telephone='7811230000'")
        cur.execute("select * from owner where telephone='7811230000'")
        assert cur.pgresult.ntuples == 0
        
    finally:
        conn.close()
```

## [TODO] Transaction with retries example

Add text to describe that Xanadu requires that in order to handle OC001 error issue the code logic needs to support a transaction retries (Recommend example should be example of the simple CRUD examples and extended to show transaction retries)

Example of transaction retries - This section will be added later

---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: Apache-2.0
