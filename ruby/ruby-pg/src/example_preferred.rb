# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

require "aurora_dsql_pg"

NUM_CONCURRENT_QUERIES = 8

# Works with both admin and non-admin users:
# - Admin users operate in the default "public" schema
# - Non-admin users operate in a custom "myschema" schema
def example
  cluster_endpoint = ENV.fetch("CLUSTER_ENDPOINT") do
    raise "CLUSTER_ENDPOINT environment variable is not set"
  end
  cluster_user = ENV.fetch("CLUSTER_USER", "admin")

  # Determine schema based on user type
  schema = cluster_user == "admin" ? "public" : "myschema"

  pool = AuroraDsql::Pg.create_pool(
    host: cluster_endpoint,
    user: cluster_user,
    pool: { size: 10 },
    occ_max_retries: 3
  )

  # Helper to set search_path on each connection checked out from the pool.
  # Unlike Go's AfterConnect or .NET's ConfigureConnectionString, the Ruby
  # connection pool does not have a per-connection setup hook, so we set
  # search_path at the start of each checkout.
  with_schema = proc do |&block|
    pool.with do |conn|
      conn.exec("SET search_path = #{conn.escape_identifier(schema)}")
      block.call(conn)
    end
  end

  # Verify connection
  pool.with { |conn| conn.exec("SELECT 1") }
  puts "Connected to Aurora DSQL"

  # Create table
  with_schema.call do |conn|
    conn.transaction do
      conn.exec("CREATE TABLE IF NOT EXISTS example_items (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, name TEXT)")
    end
  end

  # Insert data (OCC retry enabled via occ_max_retries config)
  with_schema.call do |conn|
    conn.transaction do
      conn.exec_params("INSERT INTO example_items (name) VALUES ($1)", ["test-item"])
    end
  end
  puts "Transactional write completed"

  # Run concurrent queries
  threads = NUM_CONCURRENT_QUERIES.times.map do |i|
    Thread.new do
      with_schema.call do |conn|
        result = conn.exec_params("SELECT $1::int AS worker_id", [i])
        puts "Worker #{i} result: #{result[0]['worker_id']}"
      end
    end
  end

  threads.each(&:join)
  puts "Connection pool with concurrent connections exercised successfully"
ensure
  pool&.shutdown
end

example if __FILE__ == $PROGRAM_NAME
