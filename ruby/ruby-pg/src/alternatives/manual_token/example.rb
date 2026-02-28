# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

require 'pg'
require 'aws-sdk-dsql'

def create_connection(cluster_user, cluster_endpoint, region)
  # Generate a fresh token for each connection
  credentials = Aws::CredentialProviderChain.new.resolve
  token_generator = Aws::DSQL::AuthTokenGenerator.new({
          :credentials => credentials
      })

  auth_token_params = {
        endpoint: cluster_endpoint,
        region: region,
        expires_in: 15 * 60 # 15 minutes, optional
  }

  case cluster_user
  when "admin"
    password_token = token_generator.generate_db_connect_admin_auth_token(auth_token_params)
  else
    password_token = token_generator.generate_db_connect_auth_token(auth_token_params)
  end

  conn_params = {
    host: cluster_endpoint,
    user: cluster_user,
    password: password_token,
    dbname: 'postgres',
    port: 5432,
    sslmode: 'verify-full'
  }

  # Direct SSL negotiation (libpq 17+)
  if PG::library_version >= 170000
    conn_params[:sslnegotiation] = "direct"
  end

  PG.connect(conn_params)
end

def example(conn)
  # Create table
  conn.transaction do
    conn.exec('CREATE TABLE IF NOT EXISTS owner (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(30) NOT NULL,
      city VARCHAR(80) NOT NULL,
      telephone VARCHAR(20)
    )')
  end

  # Insert data
  conn.transaction do
    conn.exec_params('INSERT INTO owner(name, city, telephone) VALUES($1, $2, $3)',
      ['John Doe', 'Anytown', '555-555-0055'])
  end

  # Read the result back
  result = conn.exec("SELECT city FROM owner where name='John Doe'")

  raise "must have fetched a row" unless result.ntuples == 1
  raise "must have fetched right city" unless result[0]["city"] == 'Anytown'

  # Clean up
  conn.exec("DELETE FROM owner where name='John Doe'")
end

def main()
  cluster_endpoint = ENV["CLUSTER_ENDPOINT"]
  region = ENV["REGION"]
  cluster_user = ENV["CLUSTER_USER"]

  raise "CLUSTER_ENDPOINT environment variable is not set" unless cluster_endpoint
  raise "REGION environment variable is not set" unless region
  raise "CLUSTER_USER environment variable is not set" unless cluster_user

  begin
    conn = create_connection(cluster_user, cluster_endpoint, region)
    if cluster_user != 'admin'
      conn.exec("SET search_path = myschema")
    end
    example(conn)
    puts "Ruby test passed"
  rescue => error
    puts error.full_message
    puts "Ruby test failed"
    raise
  ensure
    conn.close if conn
  end
end

main if __FILE__ == $PROGRAM_NAME
