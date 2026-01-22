package org.example;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.retries.api.BackoffStrategy;
import software.amazon.awssdk.services.dsql.DsqlClient;
import software.amazon.awssdk.services.dsql.DsqlClientBuilder;
import software.amazon.awssdk.services.dsql.model.CreateClusterRequest;
import software.amazon.awssdk.services.dsql.model.CreateClusterResponse;
import software.amazon.awssdk.services.dsql.model.GetClusterResponse;
import software.amazon.awssdk.services.dsql.model.UpdateClusterRequest;

public class CreateMultiRegionClusters {

    public static void main(String[] args) {
        Region region1 = Region.of(System.getenv().getOrDefault("CLUSTER_1_REGION", "us-east-1"));
        Region region2 = Region.of(System.getenv().getOrDefault("CLUSTER_2_REGION", "us-east-2"));
        Region witnessRegion = Region.of(System.getenv().getOrDefault("WITNESS_REGION", "us-west-2"));

        DsqlClientBuilder clientBuilder = DsqlClient.builder()
                .credentialsProvider(DefaultCredentialsProvider.create());

        try (
            DsqlClient client1 = clientBuilder.region(region1).build();
            DsqlClient client2 = clientBuilder.region(region2).build()
        ) {
            List<GetClusterResponse> clusters = example(client1, client2, witnessRegion);
            System.out.println("Created clusters:");
            clusters.forEach(System.out::println);
        }
    }

    public static List<GetClusterResponse> example(DsqlClient client1, DsqlClient client2, Region witnessRegion) {
        String repo = System.getenv().getOrDefault("GITHUB_REPOSITORY", "local");
        String runId = System.getenv().getOrDefault("GITHUB_RUN_ID", "local");

        // We can only set the witness region on the first cluster.
        System.out.println("Creating cluster in " + client1.serviceClientConfiguration().region());
        CreateClusterRequest request1 = CreateClusterRequest.builder()
                .deletionProtectionEnabled(true)
                .multiRegionProperties(mrp -> mrp.witnessRegion(witnessRegion.toString()))
                .tags(Map.of(
                        "Name", "java multi region cluster",
                        "Repo", repo,
                        "Type", "cluster-management",
                        "RunId", runId
                ))
                .build();
        CreateClusterResponse cluster1 = client1.createCluster(request1);
        System.out.println("Created " + cluster1.arn());

        // For the second cluster we can set the witness region and designate
        // cluster1 as a peer.
        System.out.println("Creating cluster in " + client2.serviceClientConfiguration().region());
        CreateClusterRequest request2 = CreateClusterRequest.builder()
                .deletionProtectionEnabled(true)
                .multiRegionProperties(mrp ->
                        mrp.witnessRegion(witnessRegion.toString()).clusters(cluster1.arn())
                )
                .tags(Map.of(
                        "Name", "java multi region cluster",
                        "Repo", repo,
                        "Type", "cluster-management",
                        "RunId", runId
                ))
                .build();
        CreateClusterResponse cluster2 = client2.createCluster(request2);
        System.out.println("Created " + cluster2.arn());

        // Now that we know the cluster2 ARN we can set it as a peer of cluster1.
        UpdateClusterRequest updateReq = UpdateClusterRequest.builder()
                .identifier(cluster1.identifier())
                .multiRegionProperties(mrp ->
                        mrp.witnessRegion(witnessRegion.toString()).clusters(cluster2.arn())
                )
                .build();
        client1.updateCluster(updateReq);
        System.out.printf("Added %s as a peer of %s%n", cluster2.arn(), cluster1.arn());

        // MultiRegionProperties is fully defined so both clusters will begin the
        // transition to ACTIVE.
        System.out.printf("Waiting for cluster %s to become ACTIVE%n", cluster1.arn());
        GetClusterResponse activeCluster1 = client1.waiter().waitUntilClusterActive(
                getCluster -> getCluster.identifier(cluster1.identifier()),
                config -> config.backoffStrategyV2(
                        BackoffStrategy.fixedDelayWithoutJitter(Duration.ofSeconds(10))
                ).waitTimeout(Duration.ofMinutes(5))
        ).matched().response().orElseThrow();

        System.out.printf("Waiting for cluster %s to become ACTIVE%n", cluster2.arn());
        GetClusterResponse activeCluster2 = client2.waiter().waitUntilClusterActive(
                getCluster -> getCluster.identifier(cluster2.identifier()),
                config -> config.backoffStrategyV2(
                        BackoffStrategy.fixedDelayWithoutJitter(Duration.ofSeconds(10))
                ).waitTimeout(Duration.ofMinutes(5))
        ).matched().response().orElseThrow();

        return List.of(activeCluster1, activeCluster2);
    }
}
