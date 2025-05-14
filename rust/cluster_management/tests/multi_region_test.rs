use std::env;

#[cfg(test)]
mod tests {
    use super::*;
    use aws_sdk_dsql::types::ClusterStatus;
    use dsql_examples::create_multi_region_clusters::create_multi_region_clusters;
    use dsql_examples::delete_multi_region_clusters::delete_multi_region_clusters;
    use dsql_examples::get_cluster::get_cluster;
    use dsql_examples::update_cluster::update_cluster;

    #[tokio::test]
    async fn test_multi_region_cluster_lifecycle() -> anyhow::Result<()> {
        let region_1 = env::var("CLUSTER_1_REGION").unwrap_or(String::from("us-east-1"));
        let region_2 = env::var("CLUSTER_2_REGION").unwrap_or(String::from("us-east-2"));
        let witness_region = env::var("WITNESS_REGION").unwrap_or(String::from("us-west-2"));

        println!("Creating multi-region clusters...");
        let (cluster_1, cluster_2) =
            create_multi_region_clusters(&region_1, &region_2, &witness_region).await?;

        let cluster_1_id = cluster_1.identifier;
        let cluster_2_id = cluster_2.identifier;

        println!("Getting cluster details...");
        let cluster_1_details = get_cluster(&region_1, &cluster_1_id).await?;
        assert_eq!(cluster_1_details.status, ClusterStatus::Active);
        let cluster_2_details = get_cluster(&region_2, &cluster_2_id).await?;
        assert_eq!(cluster_2_details.status, ClusterStatus::Active);

        println!("Updating clusters to remove deletion protection...");
        let update_1_response = update_cluster(&region_1, &cluster_1_id).await?;
        assert_eq!(update_1_response.status, ClusterStatus::Updating);
        let update_2_response = update_cluster(&region_2, &cluster_2_id).await?;
        assert_eq!(update_2_response.status, ClusterStatus::Updating);

        println!("Deleting clusters...");
        delete_multi_region_clusters(&region_1, &cluster_1_id, &region_2, &cluster_2_id).await?;

        println!("Multi-region cluster test completed successfully");
        Ok(())
    }
}
