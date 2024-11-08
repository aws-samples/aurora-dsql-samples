# Copyright 2024 Amazon.com, Inc. or its affiliates.
# Licensed under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
import boto3
import psycopg2

def connect_to_cluster(cluster_endpoint, region):
    password_token = generate_token(cluster_endpoint, region)
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

def crud():
    cluster_endpoint = 'yeabtpeveodnurcrcvnf6iobba.c0001.us-east-1.prod.sql.axdb.aws.dev'
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
    cur.execute(b"DROP TABLE IF EXISTS owner")
    cur.execute(b"""
        CREATE TABLE owner(
            id UUID NOT NULL DEFAULT gen_random_uuid(),
            name VARCHAR(30) NOT NULL,
            city VARCHAR(80) NOT NULL, 
            telephone VARCHAR(20) DEFAULT NULL,
            primary key (id))"""
        )
    print('Created table owner')

def insert_data(conn):
    cur = conn.cursor()
    # Insert some rows
    cur.execute("INSERT INTO owner(name, city, telephone) VALUES('Andrew', 'vancouver', '6239087654')")
    cur.execute("INSERT INTO owner(name, city) VALUES('Charles', 'richmond')")
    cur.execute("INSERT INTO owner(name, city, telephone) VALUES('Zoya', 'langley', '6230005678')")
    print('Inserted 3 rows into owner')

def fetch_data(conn):
    cur = conn.cursor()
    cur.execute("SELECT * FROM owner WHERE name='Andrew'")
    row = cur.fetchone()
    print(f'Retrieved one row from owner: {row}')
    # Verify that the result we got is what we inserted before
    assert row[0] != None
    assert row[1] == "Andrew"
    assert row[2] == "vancouver"
    assert row[3] == "6239087654"

def update_data(conn):
    cur = conn.cursor()
    cur.execute("UPDATE owner SET telephone='7811230000' WHERE name='Andrew'")
    cur.execute("SELECT telephone FROM owner WHERE name='Andrew'")
    # Select the updated telephone number for the owner 'Andrew'
    assert cur.fetchone()[0] == "7811230000"
    print('Updated one row in owner')

def delete_data(conn):
    cur = conn.cursor()
    cur.execute("DELETE FROM owner WHERE telephone='7811230000'")
    cur.execute("SELECT * FROM owner WHERE telephone='7811230000'")
    assert not cur.fetchone()
    print('Deleted rows from owner')


def generate_token(cluster_endpoint, region):
    client = boto3.client("axdbfrontend", region_name=region)
    # The token expiration time is optional, and the default value 900 seconds
    return client.generate_db_auth_token(cluster_endpoint, "DbConnectSuperuser", region)

if __name__ == "__main__":
    crud()
