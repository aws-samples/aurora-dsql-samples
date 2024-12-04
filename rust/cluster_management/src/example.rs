/// This example shows the basic process of creating a Aurora DSQL cluster,
/// Once the cluster is created, the example will read and update its details
/// by disabling the delete protection and adding new tags. The example will
/// finally verify that the cluster is updated and then finally delete it.
/// All of these operations are performed using AWS SDK for DSQL.
mod create_multi_region;
mod create_single_region;
mod delete_multi_region;
mod delete_single_region;
mod get;
mod update;
use crate::create_multi_region::create_multi_region_cluster;
use crate::create_single_region::create_cluster;
use crate::delete_multi_region::delete_multi_region_cluster;
use crate::delete_single_region::delete_cluster;
use crate::get::{get_cluster, list_cluster_tags};
use crate::update::update_cluster;

async fn multi_region() -> anyhow::Result<()> {
    let region = "us-east-1";

    let mr_cluster_arns = create_multi_region_cluster(region).await;
    // Wait until the cluster is created. Wait time is chosen randomly.
    tokio::time::sleep(tokio::time::Duration::from_secs(120)).await;
    delete_multi_region_cluster(region, mr_cluster_arns).await;
    println!("Multi-region cluster created and deleted successfully.");

    Ok(())
}

async fn single_region() -> anyhow::Result<()> {
    let region = "us-east-1";

    // Create a cluster
    let (id, arn) = create_cluster(region).await;

    // Wait until the cluster is created. Wait time is chosen randomly.
    tokio::time::sleep(tokio::time::Duration::from_secs(120)).await;

    // Get cluster works
    let get_response = get_cluster(region, id.clone()).await;
    assert_eq!(get_response.identifier, id);
    assert!(get_response.deletion_protection_enabled);
    assert_eq!(get_response.arn, arn);

    // Update cluster works
    let update_response = update_cluster(region, id.clone()).await;
    assert_eq!(update_response.identifier, id);

    // Check if the update has worked
    let get_response = get_cluster(region, id.clone()).await;
    let list_cluster_tags_response = list_cluster_tags(region, arn.clone()).await;
    assert_eq!(get_response.identifier, id);
    assert!(!get_response.deletion_protection_enabled);
    assert_eq!(get_response.arn, arn);
    assert_eq!(list_cluster_tags_response
            .tags()
            .unwrap()
            .get("Name")
            .unwrap(), 
        "example-cluster");
    assert_eq!(list_cluster_tags_response
            .tags()
            .unwrap()
            .get("Function")
            .unwrap(), 
        "Billing");
    assert_eq!(list_cluster_tags_response
            .tags()
            .unwrap()
            .get("Environment")
            .unwrap(), 
        "Production");

    // Delete the cluster
    delete_cluster(region, id).await;
    println!("Single-region cluster created, updated, and deleted successfully.");

    Ok(())
}

#[tokio::main(flavor = "current_thread")]
#[allow(dead_code)]
async fn main() -> anyhow::Result<()> {
    multi_region().await?;
    single_region().await?;
    Ok(())
}

#[cfg(test)]
mod tests {

    use super::*;
    use tokio::test;

    // Smoke test multi region
    #[test]
    async fn smoke_test_multi_region() {
        multi_region().await.unwrap();
    }

    // Smoke test single region
    #[test]
    async fn smoke_test_single_region() {
        single_region().await.unwrap();
    }
}
