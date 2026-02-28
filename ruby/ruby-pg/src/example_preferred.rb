# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

require "aurora_dsql_pg"

NUM_CONCURRENT_QUERIES = 8

def example
  cluster_endpoint = ENV.fetch("CLUSTER_ENDPOINT") do
    raise "CLUSTER_ENDPOINT environment variable is not set"
  end

  pool = AuroraDsql::Pg.create_pool(
    host: cluster_endpoint,
    pool_size: 10,
    occ_max_retries: 3
  )

  # Verify connection
  pool.with { |conn| conn.exec("SELECT 1") }
  puts "Connected to Aurora DSQL"

  # Create table
  pool.with do |conn|
    conn.transaction do
      conn.exec("CREATE TABLE IF NOT EXISTS example_items (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, name TEXT)")
    end
  end

  # Insert data (OCC retry enabled via occ_max_retries config)
  pool.with do |conn|
    conn.transaction do
      conn.exec_params("INSERT INTO example_items (name) VALUES ($1)", ["test-item"])
    end
  end
  puts "Transactional write completed"

  # Run concurrent queries
  threads = NUM_CONCURRENT_QUERIES.times.map do |i|
    Thread.new do
      pool.with do |conn|
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
