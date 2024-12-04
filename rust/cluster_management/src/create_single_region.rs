use aws_config::load_defaults;
use aws_sdk_dsql::{config::{BehaviorVersion, Region}, Client, Config};
use std::collections::HashMap;

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

/// Create a cluster without delete protection and a name
pub async fn create_cluster(region: &'static str) -> (String, String) {
    let client = dsql_client(region).await;
    let tags = HashMap::from([
        (String::from("Name"), String::from("example-cluster"))
    ]);

    let create_cluster_output = client
        .create_cluster()
        .set_tags(Some(tags))
        .deletion_protection_enabled(true)
        .send()
        .await
        .unwrap();

    // Response contains ARNs for each region.
    let identifier = create_cluster_output.identifier().to_owned();
    let arn = create_cluster_output.arn().to_owned();
    assert_eq!(create_cluster_output.status().as_str(), "CREATING");
    assert!(create_cluster_output.deletion_protection_enabled());
    (identifier, arn)
}

#[tokio::main(flavor = "current_thread")]
#[allow(dead_code)]
pub async fn main() -> anyhow::Result<()> {
    let region = "us-east-1";

    let (identifier, arn) = create_cluster(region).await;
    println!("cluster created successfully id: {identifier}, arn: {arn}");
    Ok(())
}

