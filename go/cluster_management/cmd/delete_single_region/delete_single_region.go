package main

import (
	"context"
	"example/internal/util"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dsql"
)

func DeleteSingleRegion(ctx context.Context, identifier, region string) error {

	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		log.Fatalf("Failed to load AWS configuration: %v", err)
	}

	// Initialize the DSQL client
	client := dsql.NewFromConfig(cfg)

	// Create delete cluster input
	deleteInput := &dsql.DeleteClusterInput{
		Identifier: &identifier,
	}

	// Delete the cluster
	result, err := client.DeleteCluster(ctx, deleteInput)
	if err != nil {
		return fmt.Errorf("failed to delete cluster: %w", err)
	}

	fmt.Printf("Initiated deletion of cluster: %s\n", *result.Arn)

	// Create waiter to check cluster deletion
	waiter := dsql.NewClusterNotExistsWaiter(client, func(options *dsql.ClusterNotExistsWaiterOptions) {
		options.MinDelay = 10 * time.Second
		options.MaxDelay = 30 * time.Second
		options.LogWaitAttempts = true
	})

	// Create the input for checking cluster status
	getInput := &dsql.GetClusterInput{
		Identifier: &identifier,
	}

	// Wait for the cluster to be deleted
	fmt.Printf("Waiting for cluster %s to be deleted...\n", identifier)
	err = waiter.Wait(ctx, getInput, 5*time.Minute)
	if err != nil {
		return fmt.Errorf("error waiting for cluster to be deleted: %w", err)
	}

	fmt.Printf("Cluster %s has been successfully deleted\n", identifier)
	return nil
}

// Example usage in main function
func main() {
	// Your existing setup code for client configuration...

	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Minute)
	defer cancel()

	identifier := os.Getenv("CLUSTER_ID")
	if identifier == "" {
		log.Fatal("CLUSTER_ID environment variable is not set")
	}

	region := util.GetEnvWithDefault("CLUSTER_REGION", "us-east-1")

	err := DeleteSingleRegion(ctx, identifier, region)
	if err != nil {
		log.Fatalf("Failed to delete cluster: %v", err)
	}

}
