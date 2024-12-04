require 'aws-sdk-core'
require 'aws-sdk-dsql'

def create_multi_region_cluster(region)
  us_east_1_props = {
    deletion_protection_enabled: false,
    tags: {
      'Name' => 'use1-example-cluster',
      'Usecase' => 'testing-mr-use1'
    }
  }
  
  us_east_2_props = {
    deletion_protection_enabled: false,
    tags: {
      'Name' => 'use2-example-cluster',
      'Usecase' => 'testing-mr-use2'
    }
  }
  
  begin
    # Create client with default configuration and credentials
    client = Aws::DSQL::Client.new(region: region)
    response = client.create_multi_region_clusters(
      linked_region_list: ['us-east-1', 'us-east-2'],
      witness_region: 'us-west-2',
      cluster_properties: {
        'us-east-1' => us_east_1_props,
        'us-east-2' => us_east_2_props
      }
    )
    
    # Extract cluster ARNs from the response
    arns = response.linked_cluster_arns
    raise "Expected 2 cluster ARNs, got #{arns.length}" unless arns.length == 2
        
    arns
  rescue Aws::Errors::ServiceError => e
    raise "Failed to create multi-region clusters: #{e.message}"
  end
end
