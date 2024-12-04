require 'aws-sdk-core'
require 'aws-sdk-dsql'

def delete_multi_region_cluster(region, arns)
  begin
    # Create client with default configuration and credentials
    client = Aws::DSQL::Client.new(region: region)
    client.delete_multi_region_clusters(
      linked_cluster_arns: arns
    )
  rescue Aws::Errors::ServiceError => e
    raise "Failed to delete multi-region cluster: #{e.message}"
  end
end
