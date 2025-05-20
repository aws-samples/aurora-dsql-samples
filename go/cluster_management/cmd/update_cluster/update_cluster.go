package main

import (
	"context"
	"example/internal/util"
	"log"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"

	"github.com/aws/aws-sdk-go-v2/service/dsql"
)

func UpdateCluster(ctx context.Context, id, region string, deleteProtection bool) (clusterStatus *dsql.UpdateClusterOutput, err error) {

	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		log.Fatalf("Failed to load AWS configuration: %v", err)
	}

	// Initialize the DSQL client
	client := dsql.NewFromConfig(cfg)

	input := dsql.UpdateClusterInput{
		Identifier:                &id,
		DeletionProtectionEnabled: &deleteProtection,
	}

	clusterStatus, err = client.UpdateCluster(context.Background(), &input)

	if err != nil {
		log.Fatalf("Failed to update cluster: %v", err)
	}

	log.Printf("Cluster updated successfully: %v", clusterStatus.Status)
	return clusterStatus, nil
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Minute)
	defer cancel()

	deleteProtection := util.GetEnvWithDefault("DELETE_PROTECTION", "false") == "true"

	identifier := os.Getenv("CLUSTER_ID")
	if identifier == "" {
		log.Fatal("CLUSTER_ID environment variable is not set")
	}

	region := util.GetEnvWithDefault("CLUSTER_REGION", "us-east-1")

	_, err := UpdateCluster(ctx, identifier, region, deleteProtection)
	if err != nil {
		log.Fatalf("Failed to update cluster: %v", err)
	}
}
