require 'aws-sdk-core'
require 'aws-sdk-dsql'

def delete_cluster(region, identifier)
  begin
    # Create client with default configuration and credentials
    client = Aws::DSQL::Client.new(region: region)
    
    delete_response = client.delete_cluster(
        identifier: identifier
    )
    raise "Unexpected status when deleting cluster: #{delete_response.status}" unless delete_response.status == 'DELETING'
    delete_response
  rescue Aws::Errors::ServiceError => e
    raise "Failed to delete cluster: #{e.message}"
  end
end
