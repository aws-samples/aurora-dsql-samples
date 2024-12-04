/*
 Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the "License").
 You may not use this file except in compliance with the License.
 A copy of the License is located at

     http://www.apache.org/licenses/LICENSE-2.0

 or in the "license" file accompanying this file. This file is distributed
 on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 express or implied. See the License for the specific language governing
 permissions and limitations under the License.
 */

use aws_config::load_defaults;
use aws_sdk_dsql::{config::{BehaviorVersion, Region}, Client, Config};
use aws_sdk_dsql::types::LinkedClusterProperties;

/// Create a client. We will use this later for performing operations on the cluster.
async fn dsql_client(region: &'static str) -> Client {
    // Load default SDK configuration
    let sdk_defaults = load_defaults(BehaviorVersion::latest()).await;

    // You can set your own credentials by following this guide
    // <https://docs.aws.amazon.com/sdk-for-rust/latest/dg/credproviders.html>
    let credentials = sdk_defaults
        .credentials_provider()
        .unwrap();

    let config = Config::builder()
        .behavior_version(BehaviorVersion::latest())
        .credentials_provider(credentials)
        .region(Region::new(region))
        .build();
    
    Client::from_conf(config)
}

/// Create a multi-region cluster
pub async fn create_multi_region_cluster(region: &'static str) -> Vec<String> {
    let client = dsql_client(region).await;
    let us_east_1_props = LinkedClusterProperties::builder()
        .deletion_protection_enabled(false)
        .tags("Name", "use1-example-cluster")
        .tags("Usecase", "testing-mr-use1")
        .build();

    let us_east_2_props = LinkedClusterProperties::builder()
        .deletion_protection_enabled(false)
        .tags(String::from("Name"), String::from("use2-example-cluster"))
        .tags(String::from("Usecase"), String::from("testing-mr-use2"))
        .build();

    let create_mr_cluster_output = client
        .create_multi_region_clusters()
        .linked_region_list("us-east-1")
        .linked_region_list("us-east-2")
        .witness_region("us-west-2")
        .cluster_properties("us-east-1", us_east_1_props)
        .cluster_properties("us-east-2", us_east_2_props)
        .send()
        .await
        .unwrap();

    // Response contains cluster identifier, its ARN, status etc.
    let arns: Vec<String> = create_mr_cluster_output.linked_cluster_arns().into();
    assert_eq!(arns.len(), 2);
    arns
}

#[tokio::main(flavor = "current_thread")]
pub async fn main() -> anyhow::Result<()> {
    let region = "us-east-1";

    let arns = create_multi_region_cluster(region).await;
    for arn in arns {
        println!("Created: {arn}");
    }
    Ok(())
}

