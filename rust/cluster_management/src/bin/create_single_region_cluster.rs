use aws_config::load_defaults;
use aws_sdk_dsql::client::Waiters;
use aws_sdk_dsql::operation::get_cluster::GetClusterOutput;
use aws_sdk_dsql::{
    Client, Config,
    config::{BehaviorVersion, Region},
};
use std::collections::HashMap;
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

/// Create an example DSQL cluster.
pub async fn create_cluster(region: &str) -> anyhow::Result<GetClusterOutput> {
    let client = dsql_client(region).await?;
    let tags = HashMap::from([
        (
            String::from("Name"),
            String::from("rust single region cluster"),
        ),
        (
            String::from("Repo"),
            String::from("aws-samples/aurora-dsql-samples"),
        ),
    ]);

    let create_cluster_output = client
        .create_cluster()
        .set_tags(Some(tags))
        .deletion_protection_enabled(true)
        .send()
        .await?;
    println!("Created {}", create_cluster_output.arn);

    println!("Waiting for cluster to become ACTIVE");
    let cluster = client
        .wait_until_cluster_active()
        .identifier(&create_cluster_output.identifier)
        .wait(std::time::Duration::from_secs(300)) // Wait up to 5 minutes
        .await?
        .into_result()?;

    Ok(cluster)
}

#[tokio::main(flavor = "current_thread")]
pub async fn main() -> anyhow::Result<()> {
    let region = env::var("CLUSTER_REGION").expect("env variable `CLUSTER_REGION` should be set");

    let output = create_cluster(&region).await?;
    println!("{:#?}", output);
    Ok(())
}
