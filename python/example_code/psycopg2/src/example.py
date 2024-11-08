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

def insert_data(conn):
    cur = conn.cursor()
    # Insert some rows
    cur.execute("insert into owner(name, city, telephone) values('Andrew', 'vancouver', '6239087654')")
    cur.execute("insert into owner(name, city) values('Charles', 'richmond')")
    cur.execute("insert into owner(name, city, telephone) values('Zoya', 'langley', '6230005678')")
    print('Inserted 3 rows into owner')

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

def update_data(conn):
    cur = conn.cursor()
    cur.execute("update owner set telephone='7811230000' where name='Andrew'")
    cur.execute("select telephone from owner where name='Andrew'")
    # Select the updated telephone number for the owner 'Andrew'
    assert cur.fetchone()[0] == "7811230000"
    print('Updated one row in owner')

def delete_data(conn):
    cur = conn.cursor()
    cur.execute("delete from owner where telephone='7811230000'")
    cur.execute("select * from owner where telephone='7811230000'")
    assert not cur.fetchone()
    print('Deleted rows from owner')


def generate_token(cluster_endpoint, region):
    client = boto3.client("axdbfrontend", region_name=region)
    # The token expiration time is optional, and the default value 900 seconds
    return client.generate_db_auth_token(cluster_endpoint, "DbConnectSuperuser", region)

if __name__ == "__main__":
    crud()
