package main

import (
	"context"
	"example/internal/util"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dsql"
	dtypes "github.com/aws/aws-sdk-go-v2/service/dsql/types"
)

func CreateMultiRegionClusters(ctx context.Context, witness, region1, region2 string) error {

	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region1))
	if err != nil {
		log.Fatalf("Failed to load AWS configuration: %v", err)
	}

	// Create a DSQL region 1 client
	client := dsql.NewFromConfig(cfg)

	cfg2, err := config.LoadDefaultConfig(ctx, config.WithRegion(region2))
	if err != nil {
		log.Fatalf("Failed to load AWS configuration: %v", err)
	}

	// Create a DSQL region 2 client
	client2 := dsql.NewFromConfig(cfg2)

	// Create cluster
	deleteProtect := true

	// We can only set the witness region for the first cluster
	input := &dsql.CreateClusterInput{
		DeletionProtectionEnabled: &deleteProtect,
		MultiRegionProperties: &dtypes.MultiRegionProperties{
			WitnessRegion: aws.String(witness),
		},
		Tags: map[string]string{
			"Repo":  os.Getenv("GITHUB_REPOSITORY"),
			"Name":  util.GetUniqueRunTagName("go multi-region cluster"),
			"Type":  "cluster-management",
			"RunId": util.GetEnvWithDefault("GITHUB_RUN_ID", "local"),
		},
	}

	clusterProperties, err := client.CreateCluster(context.Background(), input)

	if err != nil {
		return fmt.Errorf("failed to create first cluster: %v", err)
	}

	// create second cluster
	cluster2Arns := []string{*clusterProperties.Arn}

	// For the second cluster we can set witness region and designate the first cluster as a peer
	input2 := &dsql.CreateClusterInput{
		DeletionProtectionEnabled: &deleteProtect,
		MultiRegionProperties: &dtypes.MultiRegionProperties{
			WitnessRegion: aws.String("us-west-2"),
			Clusters:      cluster2Arns,
		},
		Tags: map[string]string{
			"Repo":  os.Getenv("GITHUB_REPOSITORY"),
			"Name":  util.GetUniqueRunTagName("go multi-region cluster"),
			"Type":  "cluster-management",
			"RunId": util.GetEnvWithDefault("GITHUB_RUN_ID", "local"),
		},
	}

	clusterProperties2, err := client2.CreateCluster(context.Background(), input2)

	if err != nil {
		return fmt.Errorf("failed to create second cluster: %v", err)
	}

	// link initial cluster to second cluster
	cluster1Arns := []string{*clusterProperties2.Arn}

	// Now that we know the second cluster arn we can set it as a peer of the first cluster
	input3 := dsql.UpdateClusterInput{
		Identifier: clusterProperties.Identifier,
		MultiRegionProperties: &dtypes.MultiRegionProperties{
			WitnessRegion: aws.String("us-west-2"),
			Clusters:      cluster1Arns,
		}}

	_, err = client.UpdateCluster(context.Background(), &input3)

	if err != nil {
		return fmt.Errorf("failed to update cluster to associate with first cluster. %v", err)
	}

	// Create the waiter with our custom options for first cluster
	waiter := dsql.NewClusterActiveWaiter(client, func(o *dsql.ClusterActiveWaiterOptions) {
		o.MaxDelay = 30 * time.Second // Creating a multi-region cluster can take a few minutes
		o.MinDelay = 10 * time.Second
		o.LogWaitAttempts = true
	})

	// Now that multiRegionProperties is fully defined for both clusters
	// they'll begin the transition to ACTIVE

	// Create the input for the clusterProperties to monitor for first cluster
	getInput := &dsql.GetClusterInput{
		Identifier: clusterProperties.Identifier,
	}

	// Wait for the first cluster to become active
	fmt.Printf("Waiting for first cluster %s to become active...\n", *clusterProperties.Identifier)
	err = waiter.Wait(ctx, getInput, 5*time.Minute)
	if err != nil {
		return fmt.Errorf("error waiting for first cluster to become active: %w", err)
	}

	// Create the waiter with our custom options
	waiter2 := dsql.NewClusterActiveWaiter(client2, func(o *dsql.ClusterActiveWaiterOptions) {
		o.MaxDelay = 30 * time.Second // Creating a multi-region cluster can take a few minutes
		o.MinDelay = 10 * time.Second
		o.LogWaitAttempts = true
	})

	// Create the input for the clusterProperties to monitor for second
	getInput2 := &dsql.GetClusterInput{
		Identifier: clusterProperties2.Identifier,
	}

	// Wait for the second cluster to become active
	fmt.Printf("Waiting for second cluster %s to become active...\n", *clusterProperties2.Identifier)
	err = waiter2.Wait(ctx, getInput2, 5*time.Minute)
	if err != nil {
		return fmt.Errorf("error waiting for second cluster to become active: %w", err)
	}

	fmt.Printf("Cluster %s is now active\n", *clusterProperties.Identifier)
	fmt.Printf("Cluster %s is now active\n", *clusterProperties2.Identifier)
	return nil
}

// Example usage in main function
func main() {
	// Set up context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	witnessRegion := util.GetEnvWithDefault("WITNESS_REGION", "us-west-2")

	region1 := util.GetEnvWithDefault("CLUSTER_1_REGION", "us-east-1")
	region2 := util.GetEnvWithDefault("CLUSTER_2_REGION", "us-east-2")

	err := CreateMultiRegionClusters(ctx, witnessRegion, region1, region2)
	if err != nil {
		fmt.Printf("failed to create multi-region clusters: %v", err)
		panic(err)
	}

}
