import psycopg2
import boto3
import os, sys

def main(cluster_endpoint, region):
    # Generate a password token
    client = boto3.client("dsql", region_name=region)
    # The token expiration time is optional, and the default value 900 seconds
    password_token = client.generate_db_connect_admin_auth_token(cluster_endpoint, region)

    # connection parameters
    dbname = "dbname=postgres"
    user = "user=admin"
    host = f'host={cluster_endpoint}'
    sslmode = "sslmode=require"
    password = f'password={password_token}'

    # Make a connection to the cluster
    conn = psycopg2.connect('%s %s %s %s %s' % (dbname, user, host, sslmode, password))

    conn.set_session(autocommit=True)

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

    # Read back what we have inserted
    cur.execute("SELECT * FROM owner WHERE name='John Doe'")
    row = cur.fetchone()
    
    # Verify that the result we got is what we inserted before
    assert row[0] != None
    assert row[1] == "John Doe"
    assert row[2] == "Anytown"
    assert row[3] == "555-555-0150"
    
    # Insert some rows
    # Placing this cleanup the table after the example. If we run the example
    # again we do not have to worry about data inserted by previous runs
    cur.execute("DELETE FROM owner where name = 'John Doe'")

if __name__ == "__main__":
    cluster_endpoint = os.environ.get("CLUSTER_ENDPOINT", None)
    region = os.environ.get("REGION", None)
    if cluster_endpoint is None:
        sys.exit("CLUSTER_ENDPOINT environment variable is not set")
    if region is None:
        sys.exit("REGION environment variable is not set")
    main(cluster_endpoint, region)
    