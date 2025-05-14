use aws_config::load_defaults;
use aws_sdk_dsql::client::Waiters;
use aws_sdk_dsql::{
    Client, Config,
    config::{BehaviorVersion, Region},
};
use std::env;

/// Create a client. We will use this later for performing operations on the cluster.
async fn dsql_client(region: &str) -> anyhow::Result<Client> {
    // Load default SDK configuration
    let sdk_defaults = load_defaults(BehaviorVersion::latest()).await;

    // You can set your own credentials by following this guide
    // https://docs.aws.amazon.com/sdk-for-rust/latest/dg/credproviders.html
    let credentials = sdk_defaults
        .credentials_provider()
        .ok_or_else(|| anyhow::anyhow!("Failed to obtain credentials provider"))?;

    let config = Config::builder()
        .behavior_version(BehaviorVersion::latest())
        .credentials_provider(credentials)
        .region(Region::new(region.to_owned()))
        .build();

    Ok(Client::from_conf(config))
}

/// Delete the provided DSQL cluster.
pub async fn delete_cluster(region: &str, identifier: &str) -> anyhow::Result<()> {
    let client = dsql_client(region).await?;
    let delete_response = client
        .delete_cluster()
        .identifier(identifier)
        .send()
        .await?;
    println!("Initiated delete of {}", delete_response.arn);

    println!("Waiting for cluster to finish deletion");
    client
        .wait_until_cluster_not_exists()
        .identifier(identifier)
        .wait(std::time::Duration::from_secs(300)) // Wait up to 5 minutes
        .await?;

    Ok(())
}

#[tokio::main(flavor = "current_thread")]
pub async fn main() -> anyhow::Result<()> {
    let region = env::var("CLUSTER_REGION").expect("env variable `CLUSTER_REGION` should be set");
    let cluster_id = env::var("CLUSTER_ID").expect("env variable `CLUSTER_ID` should be set");

    delete_cluster(&region, &cluster_id).await?;
    println!("Deleted {cluster_id}");

    Ok(())
}
