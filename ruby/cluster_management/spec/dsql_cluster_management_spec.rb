require 'create_single_region_cluster'
require 'create_multi_region_clusters'
require 'delete_single_region_cluster'
require 'delete_multi_region_clusters'
require 'get_cluster'
require 'update_cluster'

region_1 = ENV.fetch("REGION_1", "us-east-1")
region_2 = ENV.fetch("REGION_2", "us-east-2")
witness_region = ENV.fetch("WITNESS_REGION", "us-west-2")

describe 'perform multi-region smoke tests' do
  it 'does not raise any exception' do

    expect {
      puts "Running multi region test."
      cluster_1, cluster_2 = create_multi_region_clusters(region_1, region_2, witness_region)
      cluster_id_1 = cluster_1["identifier"]
      cluster_id_2 = cluster_2["identifier"]
      raise "Cluster_1 identifier should not be null" if cluster_id_1.nil?
      raise "Cluster_2 identifier should not be null" if cluster_id_2.nil?

      update_cluster(region_1, {
        identifier: cluster_id_1,
        deletion_protection_enabled: false
      })
      update_cluster(region_2, {
        identifier: cluster_id_2,
        deletion_protection_enabled: false
      })

      delete_multi_region_clusters(region_1, cluster_id_1, region_2, cluster_id_2)
    }.not_to raise_error
  end
end

describe 'perform single-region smoke tests' do
  it 'does not raise any exception' do

    expect {
      puts "Running single region test."
      cluster = create_cluster(region_1)
      cluster_id = cluster["identifier"]
      raise "Cluster identifier should not be null" if cluster_id.nil?

      get_response = get_cluster(region_1, cluster_id)
      raise "Get response did not contain ARN" if get_response["arn"].nil?
      raise "Deletion protection should be disabled before update." unless get_response["deletion_protection_enabled"]

      update_cluster(region_1, {
        identifier: cluster_id,
        deletion_protection_enabled: false
      })
      get_response = get_cluster(region_1, cluster_id)
      raise "Get response did not contain ARN" if get_response["arn"].nil?
      raise "Deletion protection should be disabled after update." if get_response["deletion_protection_enabled"]
      delete_cluster(region_1, cluster_id)

    }.not_to raise_error
  end
end
