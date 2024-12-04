require 'aws-sdk-core'
require 'aws-sdk-dsql'
require_relative 'create_multi_region'
require_relative 'create_single_region'
require_relative 'delete_multi_region'
require_relative 'delete_single_region'
require_relative 'get'
require_relative 'update'

def multi_region()
    region = "us-east-1"
    # Create multi-region cluster
    mr_cluster_arns = create_multi_region_cluster(region)
    puts "Multi region cluster created: arn1: #{mr_cluster_arns[0]} - arn2: #{mr_cluster_arns[1]}}"
    raise "ARN 1 should not be nil" if mr_cluster_arns[0].nil?
    raise "ARN 2 should not be nil" if mr_cluster_arns[1].nil?

    # Wait until the cluster is created. Wait time is chosen randomly.
    sleep(120)

    # Delete multi-region cluster
    delete_multi_region_cluster(region, mr_cluster_arns)
end

def single_region()
    region = "us-east-1"
    # Create regular cluster
    cluster = create_cluster(region)
    id = cluster[0]
    arn = cluster[1]

    puts "Cluster created: id: #{id} - arn: #{arn}"

    # Wait until the cluster is created. Wait time is chosen randomly.
    sleep(120)

    # Get cluster
    get_response = get_cluster(region, cluster[0])
    puts "Get cluster result: #{get_response}"
    raise "Get returned incorrect identifier" unless get_response.identifier == cluster[0]
    raise "Get returned incorrect arn" unless get_response.arn == cluster[1]
    raise "Get returned incorrect deletion protection value" unless get_response[2]

    # Update cluster tags and check response
    update_cluster(region, cluster[0])
    puts "Updated cluster: #{id}"

    tag_response = list_cluster_tags(region, arn)
    puts "Tags after update: #{tag_response.tags}"
    raise "Incorrect tags returned" unless tag_response.tags["Function"] == "Billing" && tag_response.tags["Environment"] == "Production" && tag_response.tags["Name"] == "example_cluster_ruby"

    # Delete cluster
    delete_response = delete_cluster(region, id)
    puts "Delete cluster response: #{delete_response}"
end
