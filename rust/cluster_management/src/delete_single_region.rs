use aws_config::load_defaults;
use aws_sdk_dsql::{config::{BehaviorVersion, Region}, Client, Config};

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

// Delete a DSQL cluster
pub async fn delete_cluster(region: &'static str, identifier: String) {
    let client = dsql_client(region).await;
    let delete_response = client
        .delete_cluster()
        .identifier(identifier)
        .send()
        .await
        .unwrap();
    assert_eq!(delete_response.status().as_str(), "DELETING");
}

#[tokio::main(flavor = "current_thread")]
pub async fn main() -> anyhow::Result<()> {
    let region = "us-east-1";
    delete_cluster(region, "<cluster to be deleted>".to_owned()).await;
    Ok(())
}