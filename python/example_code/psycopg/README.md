# Psycopg with Aurora DSQL

## Table of Contents

1. Prerequisites
2. Setup test running environment
3. Example using psycopg3 with Aurora DSQL

## Prerequisites

* You must have an AWS account, and have your default credentials and AWS Region configured as described in the 
[AWS Tools and SDKs Shared Configuration and Credentials Reference Guide](https://docs.aws.amazon.com/credref/latest/refdocs/creds-config-files.html).
* [Python 3.8.0 or later](https://www.python.org/) - You can verify your Python installation with `python3 -V`
* Aurora DSQL python SDK is required to run psycopg with Aurora DSQL. Following [Aurora DSQL user guide](https://alpha.www.docs.aws.a2z.com/distributed-sql/latest/userguide/accessing-install-sdk.html) for python SDK installation. [TODO: update the link here with office link when the user guide is released]

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

## Example using psycopg3 with Aurora DSQL

```py
import psycopg
import boto3

def main():
    # Please replace with your own cluster endpoint
    cluster_endpoint = 'foo0bar1baz2quux3quuux4.dsql.us-east-1.on.aws'
    region = 'us-east-1'

    # Generate a password token
    client = boto3.client("dsql", region_name=region)
    # The token expiration time is optional, and the default value 900 seconds
    # if you are not using admin role, use generate_db_connect_auth_token instead
    password_token = client.generate_db_connect_admin_auth_token(cluster_endpoint, region)

    # connection parameters
    dbname = "dbname=postgres"
    user = "user=admin"
    host = f'host={cluster_endpoint}'
    sslmode = "sslmode=require"
    sslrootcert = "sslrootcert=system"
    password = f'password={password_token}'

    # Make a connection to the cluster
    conn = psycopg.connect('%s %s %s %s %s %s' % (dbname, user, host, sslmode, sslrootcert, password))

    conn.set_autocommit(True)

    cur = conn.cursor()

    cur.execute(b"""
        CREATE TABLE IF NOT EXISTS owner(
            id uuid NOT NULL DEFAULT gen_random_uuid(),
            name varchar(30) NOT NULL,
            city varchar(80) NOT NULL,
            telephone varchar(20) DEFAULT NULL,
            PRIMARY KEY (id))"""
        )

    # Insert some rows
    cur.execute("INSERT INTO owner(name, city, telephone) VALUES('John Doe', 'Anytown', '555-555-0150')")

    cur.execute("SELECT * FROM owner WHERE name='John Doe'")
    row = cur.fetchone()
    
    # Verify that the result we got is what we inserted before
    assert row[0] != None
    assert row[1] == "John Doe"
    assert row[2] == "Anytown"
    assert row[3] == "555-555-0150"

if __name__ == "__main__":
    main()
```
---

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. 

SPDX-License-Identifier: Apache-2.0
