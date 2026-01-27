# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os

from psycopg import pq

import aurora_dsql_psycopg as dsql


def create_connection(cluster_user, cluster_endpoint):
    ssl_cert_path = "./root.pem"
    if not os.path.isfile(ssl_cert_path):
        raise FileNotFoundError(f"SSL certificate file not found: {ssl_cert_path}")

    conn_params = {
        "user": cluster_user,
        "host": cluster_endpoint,
        "sslmode": "verify-full",
        "sslrootcert": ssl_cert_path,
    }

    # Use the more efficient connection method if it's supported.
    if pq.version() >= 170000:
        conn_params["sslnegotiation"] = "direct"

    # Make a connection to the cluster
    conn = dsql.connect(**conn_params)

    if cluster_user == "admin":
        schema = "public"
    else:
        schema = "myschema"

    try:
        with conn.cursor() as cur:
            cur.execute(f"SET search_path = {schema};")
            conn.commit()
    except Exception as e:
        conn.close()
        raise e

    return conn


def exercise_connection(conn):
    conn.set_autocommit(True)

    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS owner(
            id uuid NOT NULL DEFAULT gen_random_uuid(),
            name varchar(30) NOT NULL,
            city varchar(80) NOT NULL,
            telephone varchar(20) DEFAULT NULL,
            PRIMARY KEY (id))
            """
    )

    # Insert some rows
    cur.execute(
        "INSERT INTO owner(name, city, telephone) VALUES('John Doe', 'Anytown', '555-555-1999')"
    )

    cur.execute("SELECT * FROM owner WHERE name='John Doe'")
    row = cur.fetchone()

    # Verify the result we got is what we inserted before
    assert row[0] is not None
    assert row[1] == "John Doe"
    assert row[2] == "Anytown"
    assert row[3] == "555-555-1999"

    # Clean up the table after the example. If we run the example again
    # we do not have to worry about data inserted by previous runs
    cur.execute("DELETE FROM owner where name = 'John Doe'")


def main():
    conn = None
    try:
        cluster_user = os.environ.get("CLUSTER_USER", None)
        assert cluster_user is not None, "CLUSTER_USER environment variable is not set"

        cluster_endpoint = os.environ.get("CLUSTER_ENDPOINT", None)
        assert cluster_endpoint is not None, "CLUSTER_ENDPOINT environment variable is not set"

        conn = create_connection(cluster_user, cluster_endpoint)
        exercise_connection(conn)
    finally:
        if conn is not None:
            conn.close()

    print("Connection exercised successfully")


if __name__ == "__main__":
    main()
