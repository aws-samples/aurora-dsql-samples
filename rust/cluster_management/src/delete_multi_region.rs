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
use aws_sdk_dsql::operation::RequestId;

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

// Delete a Multi region DSQL cluster
pub async fn delete_multi_region_cluster(region: &'static str, arns: Vec<String>) {
    let client = dsql_client(region).await;
    let delete_response = client
        .delete_multi_region_clusters()
        .set_linked_cluster_arns(Some(arns))
        .send()
        .await
        .unwrap();
    assert!(delete_response.request_id().is_some());
}

#[tokio::main(flavor = "current_thread")]
pub async fn main() -> anyhow::Result<()> {
    let region = "us-east-1";
    let arns = vec![
        "<cluster arn from us-east-1>".to_owned(),
        "<cluster arn from us-east-2>".to_owned()
    ];
    delete_multi_region_cluster(region, arns).await;
    Ok(())
}