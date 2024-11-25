require 'aws-sdk-core'
require 'aws-sdk-dsql'

def create_client()
    region = 'us-east-1'

    # Create client with default configuration and credentials
    Aws::DSQL::Client.new(
    region: region,
    endpoint: 'https://dsql.us-east-1.api.aws'
    )
    rescue Aws::Errors::ServiceError => e
        puts "Error creating client: #{e.message}"
        raise e
end

def create_cluster(client)
    begin
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
    end
end

def create_multi_region_cluster(client)
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

def get_cluster(client, identifier)
    client.get_cluster(
        identifier: identifier
    )
end

def update_cluster(client, identifier)
    begin
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
    end
end

def list_cluster_tags(client, arn)
    client.list_tags_for_resource(
        resource_arn: arn
    )
end

def delete_cluster(client, identifier)
    delete_response = client.delete_cluster(
        identifier: identifier
    )
    raise "Unexpected status when deleting cluster: #{delete_response.status}" unless delete_response.status == 'DELETING'
    delete_response
end

def delete_multi_region_cluster(client, arns)    
    client.delete_multi_region_clusters(
      linked_cluster_arns: arns
    )
end

def example()
    client = create_client()

    # Create multi-region cluster
    mr_cluster_arns = create_multi_region_cluster(client)
    puts "Multi region cluster created: arn1: #{mr_cluster_arns[0]} - arn2: #{mr_cluster_arns[1]}}"
    raise "ARN 1 should not be nil" if mr_cluster_arns[0].nil?
    raise "ARN 2 should not be nil" if mr_cluster_arns[1].nil?

    # Wait until the cluster is created
    sleep(180)

    # Delete multi-region cluster
    delete_multi_region_cluster(client, mr_cluster_arns)

    # Create regular cluster
    cluster = create_cluster(client)
    id = cluster[0]
    arn = cluster[1]
    delete_protection_enabled = cluster[2]

    puts "Cluster created: id: #{id} - arn: #{arn} delete_protection_enabled: #{delete_protection_enabled}"

    # Wait until the cluster is created
    sleep(180)

    # Get cluster
    get_response = get_cluster(client, cluster[0])
    puts "Get cluster result: #{get_response}"
    raise "Get returned incorrect identifier" unless get_response.identifier == cluster[0]
    raise "Get returned incorrect arn" unless get_response.arn == cluster[1]
    raise "Get returned incorrect deletion protection value" unless get_response[2]

    # Update cluster tags and check response
    update_response = update_cluster(client, cluster[0])
    puts "Updated cluster: #{id}"

    tag_response = list_cluster_tags(client, arn)
    puts "Tags after update: #{tag_response.tags}"
    raise "Incorrect tags returned" unless tag_response.tags["Function"] == "Billing" && tag_response.tags["Environment"] == "Production" && tag_response.tags["Name"] == "example_cluster_ruby"
    sleep(10)

    # Delete cluster
    delete_response = delete_cluster(client, id)
    puts "Delete cluster response: #{delete_response}"
end
