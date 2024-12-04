use aws_config::load_defaults;
use aws_sdk_dsql::{config::{BehaviorVersion, Region}, Client, Config};
use aws_sdk_dsql::operation::get_cluster::GetClusterOutput;
use aws_sdk_dsql::operation::list_tags_for_resource::ListTagsForResourceOutput;

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

// Get a ClusterResource from DSQL cluster identifier
pub async fn get_cluster(
    region: &'static str,
    identifier: String,
) -> GetClusterOutput {
    let client = dsql_client(region).await;
    client
        .get_cluster()
        .identifier(identifier)
        .send()
        .await
        .unwrap()
}

// Can also list tags associated with the cluster
pub async fn list_cluster_tags(
    region: &'static str,
    arn: String,
) -> ListTagsForResourceOutput {
    let client = dsql_client(region).await;
    client
        .list_tags_for_resource()
        .resource_arn(arn)
        .send()
        .await
        .unwrap()
}

#[tokio::main(flavor = "current_thread")]
pub async fn main() -> anyhow::Result<()> {
    let region = "us-east-1";

    get_cluster(region, "<your cluster id>".to_owned()).await;

    Ok(())
}
