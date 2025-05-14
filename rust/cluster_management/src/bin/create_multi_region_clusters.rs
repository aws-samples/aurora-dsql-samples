use aws_config::{BehaviorVersion, Region, load_defaults};
use aws_sdk_dsql::client::Waiters;
use aws_sdk_dsql::operation::get_cluster::GetClusterOutput;
use aws_sdk_dsql::types::MultiRegionProperties;
use aws_sdk_dsql::{Client, Config};
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

/// Create some example peered DSQL clusters.
pub async fn create_multi_region_clusters(
    region_1: &str,
    region_2: &str,
    witness_region: &str,
) -> anyhow::Result<(GetClusterOutput, GetClusterOutput)> {
    let client_1 = dsql_client(region_1).await?;
    let client_2 = dsql_client(region_2).await?;

    let tags = HashMap::from([
        (
            String::from("Name"),
            String::from("rust multi region cluster"),
        ),
        (
            String::from("Repo"),
            String::from("aws-samples/aurora-dsql-samples"),
        ),
    ]);

    // We can only set the witness region for the first cluster
    println!("Creating cluster in {region_1}");
    let cluster_1 = client_1
        .create_cluster()
        .set_tags(Some(tags.clone()))
        .deletion_protection_enabled(true)
        .multi_region_properties(
            MultiRegionProperties::builder()
                .witness_region(witness_region)
                .build(),
        )
        .send()
        .await?;
    let cluster_1_arn = &cluster_1.arn;
    println!("Created {cluster_1_arn}");

    // For the second cluster we can set witness region and designate cluster_1 as a peer
    println!("Creating cluster in {region_2}");
    let cluster_2 = client_2
        .create_cluster()
        .set_tags(Some(tags))
        .deletion_protection_enabled(true)
        .multi_region_properties(
            MultiRegionProperties::builder()
                .witness_region(witness_region)
                .clusters(&cluster_1.arn)
                .build(),
        )
        .send()
        .await?;
    let cluster_2_arn = &cluster_2.arn;
    println!("Created {cluster_2_arn}");

    // Now that we know the cluster_2 arn we can set it as a peer of cluster_1
    client_1
        .update_cluster()
        .identifier(&cluster_1.identifier)
        .multi_region_properties(
            MultiRegionProperties::builder()
                .witness_region(witness_region)
                .clusters(&cluster_2.arn)
                .build(),
        )
        .send()
        .await?;
    println!("Added {cluster_2_arn} as a peer of {cluster_1_arn}");

    // Now that the multi-region properties are fully defined for both clusters
    // they'll begin the transition to ACTIVE
    println!("Waiting for {cluster_1_arn} to become ACTIVE");
    let cluster_1_output = client_1
        .wait_until_cluster_active()
        .identifier(&cluster_1.identifier)
        .wait(std::time::Duration::from_secs(300)) // Wait up to 5 minutes
        .await?
        .into_result()?;

    println!("Waiting for {cluster_2_arn} to become ACTIVE");
    let cluster_2_output = client_2
        .wait_until_cluster_active()
        .identifier(&cluster_2.identifier)
        .wait(std::time::Duration::from_secs(300)) // Wait up to 5 minutes
        .await?
        .into_result()?;

    Ok((cluster_1_output, cluster_2_output))
}

#[tokio::main(flavor = "current_thread")]
pub async fn main() -> anyhow::Result<()> {
    let region_1 =
        env::var("CLUSTER_1_REGION").expect("env variable `CLUSTER_1_REGION` should be set");
    let region_2 =
        env::var("CLUSTER_2_REGION").expect("env variable `CLUSTER_2_REGION` should be set");
    let witness_region =
        env::var("WITNESS_REGION").expect("env variable `WITNESS_REGION` should be set");

    let (cluster_1, cluster_2) =
        create_multi_region_clusters(&region_1, &region_2, &witness_region).await?;

    println!("Created multi region clusters:");
    println!("{:#?}", cluster_1);
    println!("{:#?}", cluster_2);

    Ok(())
}
