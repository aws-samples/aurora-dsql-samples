use std::env;

#[cfg(test)]
mod tests {
    use super::*;
    use aws_sdk_dsql::types::ClusterStatus;
    use dsql_examples::create_single_region_cluster::create_cluster;
    use dsql_examples::delete_single_region_cluster::delete_cluster;
    use dsql_examples::get_cluster::get_cluster;
    use dsql_examples::update_cluster::update_cluster;

    #[tokio::test]
    async fn test_single_region_cluster_lifecycle() -> anyhow::Result<()> {
        let region = env::var("CLUSTER_REGION").unwrap_or(String::from("us-east-1"));

        println!("Creating single region cluster...");
        let output = create_cluster(&region).await?;
        let cluster_id = output.identifier;

        println!("Getting cluster details...");
        let cluster = get_cluster(&region, &cluster_id).await?;
        assert_eq!(cluster.status, ClusterStatus::Active);

        println!("Updating cluster to remove deletion protection...");
        let update_response = update_cluster(&region, &cluster_id).await?;
        assert_eq!(update_response.status, ClusterStatus::Updating);

        println!("Deleting cluster...");
        delete_cluster(&region, &cluster_id).await?;

        println!("Single region cluster test completed successfully");
        Ok(())
    }
}
