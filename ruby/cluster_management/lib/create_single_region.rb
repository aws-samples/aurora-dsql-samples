require 'aws-sdk-core'
require 'aws-sdk-dsql'

def create_cluster(region)
  begin
    # Create client with default configuration and credentials
    client = Aws::DSQL::Client.new(region: region)

    response = client.create_cluster(
      deletion_protection_enabled: true,
      tags: {
        "Name" => "example_cluster_ruby"
        }
    )

    # Extract and verify response data
    identifier = response.identifier
    arn = response.arn
    puts arn
    raise "Unexpected status when creating cluster: #{response.status}" unless response.status == 'CREATING'
    raise "Deletion protection not enabled" unless response.deletion_protection_enabled

    [identifier, arn]
  rescue Aws::Errors::ServiceError => e
    raise "Failed to create cluster: #{e.message}"
  end
end
