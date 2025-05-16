require 'create_single_region_cluster'
require 'create_multi_region_clusters'
require 'delete_single_region_cluster'
require 'delete_multi_region_clusters'
require 'get_cluster'
require 'update_cluster'

region = ENV.fetch("CLUSTER_REGION", "us-east-1")
region_1 = ENV.fetch("CLUSTER_1_REGION", "us-east-1")
region_2 = ENV.fetch("CLUSTER_2_REGION", "us-east-2")
witness_region = ENV.fetch("WITNESS_REGION", "us-west-2")

describe 'perform multi-region smoke tests' do
  it 'creates and deletes multi-region clusters' do
    puts "Running multi region test."
    cluster_1, cluster_2 = create_multi_region_clusters(region_1, region_2, witness_region)
    cluster_id_1 = cluster_1["identifier"]
    cluster_id_2 = cluster_2["identifier"]

    expect(cluster_id_1).to_not be_nil
    expect(cluster_1["status"]).to eq("ACTIVE")
    expect(cluster_id_2).to_not be_nil
    expect(cluster_2["status"]).to eq("ACTIVE")

    update_cluster(region_1, {
      identifier: cluster_id_1,
      deletion_protection_enabled: false
    })
    update_cluster(region_2, {
      identifier: cluster_id_2,
      deletion_protection_enabled: false
    })

    delete_multi_region_clusters(region_1, cluster_id_1, region_2, cluster_id_2)
  end
end

describe 'perform single-region smoke tests' do
  it 'creates and deletes a single-region cluster' do
    puts "Running single region test."
    cluster = create_cluster(region)
    cluster_id = cluster["identifier"]
    expect(cluster_id).to_not be_nil
    get_response = get_cluster(region, cluster_id)
    expect(get_response["arn"]).to_not be_nil
    expect(get_response["deletion_protection_enabled"]).to be true
    expect(get_response["status"]).to eq("ACTIVE")

    update_cluster(region, {
      identifier: cluster_id,
      deletion_protection_enabled: false
    })
    get_response = get_cluster(region, cluster_id)
    expect(get_response["arn"]).to_not be_nil
    expect(get_response["deletion_protection_enabled"]).to be false
    delete_cluster(region, cluster_id)
  end
end
