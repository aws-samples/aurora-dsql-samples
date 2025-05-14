use aws_config::{BehaviorVersion, Region, load_defaults};
use aws_sdk_dsql::client::Waiters;
use aws_sdk_dsql::{Client, Config};
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

/// Delete the provided peered DSQL clusters.
pub async fn delete_multi_region_clusters(
    region_1: &str,
    cluster_id_1: &str,
    region_2: &str,
    cluster_id_2: &str,
) -> anyhow::Result<()> {
    let client_1 = dsql_client(region_1).await?;
    let client_2 = dsql_client(region_2).await?;

    println!("Deleting cluster {cluster_id_1} in {region_1}");
    client_1
        .delete_cluster()
        .identifier(cluster_id_1)
        .send()
        .await?;

    // cluster_1 will stay in PENDING_DELETE state until cluster_2 is deleted
    println!("Deleting cluster {cluster_id_2} in {region_2}");
    client_2
        .delete_cluster()
        .identifier(cluster_id_2)
        .send()
        .await?;

    // Now that both clusters have been marked for deletion they will transition
    // to DELETING state and finalize deletion
    println!("Waiting for {cluster_id_1} to finish deletion");
    client_1
        .wait_until_cluster_not_exists()
        .identifier(cluster_id_1)
        .wait(std::time::Duration::from_secs(300)) // Wait up to 5 minutes
        .await?;

    println!("Waiting for {cluster_id_2} to finish deletion");
    client_2
        .wait_until_cluster_not_exists()
        .identifier(cluster_id_2)
        .wait(std::time::Duration::from_secs(300)) // Wait up to 5 minutes
        .await?;

    Ok(())
}

#[tokio::main(flavor = "current_thread")]
pub async fn main() -> anyhow::Result<()> {
    let region_1 =
        env::var("CLUSTER_1_REGION").expect("env variable `CLUSTER_1_REGION` should be set");
    let cluster_id_1 = env::var("CLUSTER_1_ID").expect("env variable `CLUSTER_1_ID` should be set");
    let region_2 =
        env::var("CLUSTER_2_REGION").expect("env variable `CLUSTER_2_REGION` should be set");
    let cluster_id_2 = env::var("CLUSTER_2_ID").expect("env variable `CLUSTER_2_ID` should be set");

    delete_multi_region_clusters(&region_1, &cluster_id_1, &region_2, &cluster_id_2).await?;
    println!("Deleted {cluster_id_1} in {region_1} and {cluster_id_2} in {region_2}");

    Ok(())
}
