package main

import (
	"context"
	"example/internal/util"
	"fmt"
	"log"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dsql"
)

func DeleteMultiRegionClusters(ctx context.Context, region1, clusterId1, region2, clusterId2 string) error {
	// Load the AWS configuration for region 1
	cfg1, err := config.LoadDefaultConfig(ctx, config.WithRegion(region1))
	if err != nil {
		return fmt.Errorf("unable to load SDK config for region %s: %w", region1, err)
	}

	// Load the AWS configuration for region 2
	cfg2, err := config.LoadDefaultConfig(ctx, config.WithRegion(region2))
	if err != nil {
		return fmt.Errorf("unable to load SDK config for region %s: %w", region2, err)
	}

	// Create DSQL clients for both regions
	client1 := dsql.NewFromConfig(cfg1)
	client2 := dsql.NewFromConfig(cfg2)

	// Delete cluster in region 1
	fmt.Printf("Deleting cluster %s in %s\n", clusterId1, region1)
	_, err = client1.DeleteCluster(ctx, &dsql.DeleteClusterInput{
		Identifier: aws.String(clusterId1),
	})
	if err != nil {
		return fmt.Errorf("failed to delete cluster in region %s: %w", region1, err)
	}

	// Delete cluster in region 2
	fmt.Printf("Deleting cluster %s in %s\n", clusterId2, region2)
	_, err = client2.DeleteCluster(ctx, &dsql.DeleteClusterInput{
		Identifier: aws.String(clusterId2),
	})
	if err != nil {
		return fmt.Errorf("failed to delete cluster in region %s: %w", region2, err)
	}

	// Create waiters for both regions
	waiter1 := dsql.NewClusterNotExistsWaiter(client1, func(options *dsql.ClusterNotExistsWaiterOptions) {
		options.MinDelay = 10 * time.Second
		options.MaxDelay = 30 * time.Second
		options.LogWaitAttempts = true
	})

	waiter2 := dsql.NewClusterNotExistsWaiter(client2, func(options *dsql.ClusterNotExistsWaiterOptions) {
		options.MinDelay = 10 * time.Second
		options.MaxDelay = 30 * time.Second
		options.LogWaitAttempts = true
	})

	// Wait for cluster in region 1 to be deleted
	fmt.Printf("Waiting for cluster %s to finish deletion\n", clusterId1)
	err = waiter1.Wait(ctx, &dsql.GetClusterInput{
		Identifier: aws.String(clusterId1),
	}, 5*time.Minute)
	if err != nil {
		return fmt.Errorf("error waiting for cluster deletion in region %s: %w", region1, err)
	}

	// Wait for cluster in region 2 to be deleted
	fmt.Printf("Waiting for cluster %s to finish deletion\n", clusterId2)
	err = waiter2.Wait(ctx, &dsql.GetClusterInput{
		Identifier: aws.String(clusterId2),
	}, 5*time.Minute)
	if err != nil {
		return fmt.Errorf("error waiting for cluster deletion in region %s: %w", region2, err)
	}

	fmt.Printf("Successfully deleted clusters %s in %s and %s in %s\n",
		clusterId1, region1, clusterId2, region2)
	return nil
}

// Example usage in main function
func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	region1 := util.GetEnvWithDefault("CLUSTER_1_REGION", "us-east-1")
	region2 := util.GetEnvWithDefault("CLUSTER_2_REGION", "us-east-2")
	clusterId1 := util.GetEnvWithDefault("CLUSTER_1_ID", "CLUSTER_1_ID")
	clusterId2 := util.GetEnvWithDefault("CLUSTER_2_ID", "CLUSTER_2_ID")

	err := DeleteMultiRegionClusters(
		ctx,
		region1,
		clusterId1,
		region2,
		clusterId2,
	)
	if err != nil {
		log.Fatalf("Failed to delete multi-region clusters: %v", err)
	}
}
