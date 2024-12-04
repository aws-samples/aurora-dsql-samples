require 'aws-sdk-core'
require 'aws-sdk-dsql'

def get_cluster(region, identifier)
  begin
    # Create client with default configuration and credentials
    client = Aws::DSQL::Client.new(region: region)
    client.get_cluster(
        identifier: identifier
    )
  rescue Aws::Errors::ServiceError => e
    raise "Failed to get cluster details: #{e.message}"
  end
end

def list_cluster_tags(region, arn)
  begin
    # Create client with default configuration and credentials
    client = Aws::DSQL::Client.new(region: region)
    client.list_tags_for_resource(
        resource_arn: arn
    )
  rescue Aws::Errors::ServiceError => e
    raise "Failed to get cluster details: #{e.message}"
  end
end
