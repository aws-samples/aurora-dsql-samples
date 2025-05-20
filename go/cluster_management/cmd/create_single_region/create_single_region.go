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

func CreateCluster(ctx context.Context, region string) error {

	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		log.Fatalf("Failed to load AWS configuration: %v", err)
	}

	// Create a DSQL client
	client := dsql.NewFromConfig(cfg)

	deleteProtect := true

	input := dsql.CreateClusterInput{
		DeletionProtectionEnabled: &deleteProtect,
		Tags: map[string]string{
			"Repo": os.Getenv("GITHUB_REPOSITORY"),
			"Name": util.GetUniqueRunTagName("go single region cluster"),
		},
	}

	clusterProperties, err := client.CreateCluster(context.Background(), &input)

	if err != nil {
		return fmt.Errorf("error creating cluster: %w", err)
	}

	fmt.Printf("Created cluster: %s\n", *clusterProperties.Arn)

	// Create the waiter with our custom options
	waiter := dsql.NewClusterActiveWaiter(client, func(o *dsql.ClusterActiveWaiterOptions) {
		o.MaxDelay = 30 * time.Second
		o.MinDelay = 10 * time.Second
		o.LogWaitAttempts = true
	})

	id := clusterProperties.Identifier

	// Create the input for the clusterProperties
	getInput := &dsql.GetClusterInput{
		Identifier: id,
	}

	// Wait for the cluster to become active
	fmt.Println("Waiting for cluster to become ACTIVE")
	err = waiter.Wait(ctx, getInput, 5*time.Minute)
	if err != nil {
		return fmt.Errorf("error waiting for cluster to become active: %w", err)
	}

	fmt.Printf("Cluster %s is now active\n", *id)
	return nil
}

// Example usage in main function
func main() {

	region := util.GetEnvWithDefault("CLUSTER_REGION", "us-east-1")

	// Set up context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Minute)
	defer cancel()

	if err := CreateCluster(ctx, region); err != nil {
		log.Fatalf("Failed to create cluster: %v", err)
	}
}
