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

import psycopg
import boto3

def connect_to_cluster(cluster_endpoint, region):
    client = boto3.client("axdbfrontend", region_name=region)
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


def crud():
    cluster_endpoint = 'neabtsib5crfgoglibjrznimim.c0001.us-east-1.prod.sql.axdb.aws.dev'
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


if __name__ == "__main__":
    example()
