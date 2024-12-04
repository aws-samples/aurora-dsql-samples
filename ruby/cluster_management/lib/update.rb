require 'aws-sdk-core'
require 'aws-sdk-dsql'

def update_cluster(region, identifier)
    begin
      # Create client with default configuration and credentials
      client = Aws::DSQL::Client.new(region: region)

      update_response = client.update_cluster(
          identifier: identifier,
          deletion_protection_enabled: false
      )

      client.tag_resource(
          resource_arn: update_response.arn,
          tags: {
              "Function" => "Billing",
              "Environment" => "Production"
          }
      )
      raise "Unexpected status when updating cluster: #{update_response.status}" unless update_response.status == 'UPDATING'
      update_response
    rescue Aws::Errors::ServiceError => e
      raise "Failed to update cluster details: #{e.message}"
    end
end
