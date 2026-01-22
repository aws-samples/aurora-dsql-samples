require "aws-sdk-dsql"
require "pp"

def create_cluster(region)
  client = Aws::DSQL::Client.new(region: region)
  repo = ENV.fetch("GITHUB_REPOSITORY", "local")
  run_id = ENV.fetch("GITHUB_RUN_ID", "local")
  cluster = client.create_cluster(
    deletion_protection_enabled: true,
    tags: {
      Name: "Ruby-CM-Example-Single-Region",
      Repo: repo,
      Type: "cluster-management",
      RunId: run_id
    }
  )
  puts "Created #{cluster.arn}"

  # The DSQL SDK offers built-in waiters to poll for a cluster's
  # transition to ACTIVE.
  puts "Waiting for cluster to become ACTIVE"
  client.wait_until(:cluster_active, identifier: cluster.identifier) do |w|
    # Wait for 5 minutes
    w.max_attempts = 30
    w.delay = 10
  end
rescue Aws::Errors::ServiceError => e
  abort "Unable to create cluster in #{region}: #{e.message}"
end

def main
  region = ENV.fetch("CLUSTER_REGION", "us-east-1")
  cluster = create_cluster(region)
  pp cluster
end

main if $PROGRAM_NAME == __FILE__
